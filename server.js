const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logoBase64 } = require('./logo'); 
require('dotenv').config();

const app = express();
app.use(express.json());

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
app.use('/temp', express.static(tempDir));

app.post('/generate-receipt', async (req, res) => {
    const {
        recordId, receiptId, fecha, metodoPago, customerName,
        lineItems, valorTotal, pagadoAcumulado, balanceAnterior,
        pagadoHoy, nuevoBalance
    } = req.body;

    try {
        // Helper function for currency formatting (safely cleans strings before parsing)
        const formatCurrency = (num) => {
            // Convert to string and strip out 'L.', spaces, and commas
            let cleanStr = String(num || '').replace(/[L\.\s,]/g, '');
            
            // Parse what's left as a decimal number
            const parsedNum = parseFloat(cleanStr) || 0;
            
            return 'L. ' + parsedNum.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        };

        const lineItemsHtml = (lineItems || []).map(item => `
            <tr>
                <td>${item.descripcion}</td>
                <td class="text-right">${formatCurrency(item.monto)}</td>
            </tr>
        `).join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <style>
                    :root {
                        --primary-color: #1a253a;
                        --text-main: #111111; 
                        --text-muted: #4a5568; 
                        --border-color: #cbd5e1;
                        --red-highlight: #d32f2f;
                        --bg-highlight: #f8fafc;
                    }
                    
                    body {
                        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                        color: var(--text-main);
                        background-color: #ffffff;
                        margin: 0;
                        padding: 40px;
                        font-size: 16px; 
                        min-height: 90vh;
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                    }
                    
                    .receipt-container { 
                        max-width: 800px; 
                        margin: 0 auto; 
                        width: 100%;
                        flex-grow: 1; 
                        display: flex;
                        flex-direction: column;
                    }
                    
                    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
                    .logo-section img { max-width: 200px; height: auto; }
                    .logo-section h2 { margin: 10px 0 0 0; font-size: 18px; color: var(--primary-color); }
                    .details-section { text-align: right; }
                    .details-section h1 { margin: 0 0 10px 0; font-size: 26px; color: var(--primary-color); text-transform: uppercase; }
                    .details-section p { margin: 5px 0; color: var(--text-main); }
                    .label { color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 5px; font-weight: bold; }
                    
                    .client-box { border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; margin-bottom: 40px; }
                    .client-box .label { display: block; margin-bottom: 8px; }
                    .client-box .client-name { font-size: 18px; font-weight: 600; }
                    
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { text-align: left; color: var(--text-muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 12px; border-bottom: 2px solid var(--border-color); }
                    th.text-right, td.text-right { text-align: right; }
                    td { padding: 16px 0; border-bottom: 1px solid var(--border-color); font-weight: 600; }
                    
                    .summary-section { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .summary-col { width: 45%; }
                    
                    .summary-row { display: flex; justify-content: space-between; margin-bottom: 12px; color: var(--text-main); }
                    .summary-row .value { color: var(--text-main); font-weight: 600; }
                    
                    .summary-row.bold { color: var(--primary-color); font-weight: 700; font-size: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; }
                    
                    /* FIX 6: Forces the Nuevo Balance row to stay inline and center-aligned vertically */
                    .highlight-box { background-color: var(--bg-highlight); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; margin-top: 15px; width: 100%; box-sizing: border-box; }
                    .highlight-row { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 18px;}
                    .highlight-row .red-text { color: var(--red-highlight); text-align: right; white-space: nowrap; }
                    
                    footer { text-align: center; margin-top: auto; padding-top: 30px; }
                    
                    /* FIX 5: Bolder, bigger cursive signature */
                    .signature-area { width: 350px; margin: 0 auto 30px auto; }
                    .signature-font { font-size: 72px; font-weight: bold; color: var(--primary-color); margin: 0; line-height: 1; font-style: italic; font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; }
                    .signature-area hr { border: none; border-top: 1px solid var(--text-muted); margin: 5px 0; }
                    .signature-area p { font-size: 14px; color: var(--text-muted); margin: 0; }
                    
                    .thank-you { color: var(--text-main); font-size: 18px; margin-bottom: 10px; font-weight: 600; }
                    .contact-info { color: var(--text-muted); font-size: 14px; margin-bottom: 30px; }
                    .barcode img { max-width: 300px; height: 60px; }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <header>
                        <div class="logo-section">
                            <img src="${logoBase64}" alt="MR Investments">
                            <h2>Inversiones Manuel</h2>
                        </div>
                        <div class="details-section">
                            <h1>RECIBO DE PAGO</h1>
                            <p><span class="label">RECIBO #</span> ${receiptId || 'N/A'}</p>
                            <p><span class="label">FECHA:</span> ${fecha || new Date().toLocaleDateString('es-HN')}</p>
                            <p><span class="label">MÉTODO DE PAGO:</span> ${metodoPago || 'Transferencia'}</p>
                        </div>
                    </header>

                    <div class="client-box">
                        <span class="label">CLIENTE</span>
                        <span class="client-name">${customerName}</span>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>DESCRIPCIÓN / LOTE</th>
                                <th class="text-right">MONTO PAGADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lineItemsHtml}
                        </tbody>
                    </table>

                    <div class="summary-section">
                        <div class="summary-col">
                            <div class="summary-row">
                                <span>Valor Total del Contrato</span>
                                <span class="value">${formatCurrency(valorTotal)}</span>
                            </div>
                            <div class="summary-row">
                                <span>Total Pagado Acumulado</span>
                                <span class="value">${formatCurrency(pagadoAcumulado)}</span>
                            </div>
                        </div>

                        <div class="summary-col">
                            <div class="summary-row">
                                <span>Balance Anterior Total</span>
                                <span class="value">${formatCurrency(balanceAnterior)}</span>
                            </div>
                            <div class="summary-row bold">
                                <span>Total Pagado Hoy</span>
                                <span>${formatCurrency(pagadoHoy)}</span>
                            </div>

                            <div class="highlight-box">
                                <div class="highlight-row">
                                    <span>Nuevo Balance Pendiente</span>
                                    <span class="red-text">${formatCurrency(nuevoBalance)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <footer>
                        <div class="signature-area">
                            <p class="signature-font">Manuel Rivera</p>
                            <hr>
                            <p>Firma Autorizada</p>
                        </div>
                        <p class="thank-you">Gracias por su pago y su confianza en Inversiones Manuel.</p>
                        <p class="contact-info">Inversiones Manuel | Tela, Atlántida | Tel: +504 9315-4685 | Correo: edrosfamily@gmail.com</p>
                        <div class="barcode">
                            <!-- FIX 4: Removed includetext flag from URL so only the lines render -->
                            <img src="https://bwipjs-api.metafloor.com/?bcid=code128&text=${receiptId}&scale=2&height=10" alt="Código de Barras">
                        </div>
                    </footer>
                </div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const fileName = `receipt_${recordId}_${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        const fileUrl = `https://inversion-pdf-service.onrender.com/temp/${fileName}`;

        const airtableUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Receipts/${recordId}`;
        await axios.patch(airtableUrl, {
            fields: { "Receipt PDF": [{ url: fileUrl }] }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).send('Success');

        setTimeout(() => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }, 10000);

    } catch (error) {
        console.error('Error generating PDF:', error.response ? error.response.data : error.message);
        res.status(500).send('Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Microservice running on port ${PORT}`));