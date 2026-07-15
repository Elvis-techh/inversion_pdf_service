const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// Open a public folder so Airtable can temporarily download the PDF
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
app.use('/temp', express.static(tempDir));

app.post('/generate-receipt', async (req, res) => {
    // 1. Receive frozen data from your Airtable Automation Webhook
    const { recordId, customerName, valorTotal, pagadoAcumulado, balanceAnterior, pagadoHoy, nuevoBalance } = req.body;

    try {
        // 2. The HTML Layout (Replace with your exact CSS/Styling)
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <body style="font-family: Arial, sans-serif; padding: 40px;">
                <h1 style="text-align: right;">RECIBO DE PAGO</h1>
                <div style="border: 1px solid #ccc; padding: 15px; border-radius: 5px;">
                    <strong>CLIENTE:</strong> ${customerName}
                </div>
                <br>
                <table style="width: 100%; text-align: left; border-collapse: collapse;">
                    <tr>
                        <td>Valor Total del Contrato:</td><td>${valorTotal}</td>
                        <td style="text-align: right;">Balance Anterior Total:</td><td style="text-align: right;">${balanceAnterior}</td>
                    </tr>
                    <tr>
                        <td>Total Pagado Acumulado:</td><td>${pagadoAcumulado}</td>
                        <td style="text-align: right;"><strong>Total Pagado Hoy:</strong></td><td style="text-align: right;"><strong>${pagadoHoy}</strong></td>
                    </tr>
                </table>
            </body>
            </html>
        `;

        // 3. Fire up Puppeteer to generate the PDF
        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const fileName = `receipt_${recordId}.pdf`;
        const filePath = path.join(tempDir, fileName);
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        // 4. Construct the temporary public URL for Airtable to grab
        // Note: When deployed, replace 'YOUR_SERVER_URL' with your actual hosted domain
        const fileUrl = `https://inversion-pdf-service.onrender.com/temp/${fileName}`;

        // 5. Send the file URL back to Airtable via API
        const airtableUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Receipts/${recordId}`;
        await axios.patch(airtableUrl, {
            fields: {
                "Receipt PDF": [{ url: fileUrl }]
            }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).send('Success');

        // 6. Cleanup: Delete the file after 10 seconds (gives Airtable time to download it)
        setTimeout(() => {
            fs.unlinkSync(filePath);
        }, 10000);

    } catch (error) {
        // This will print Airtable's exact error message to your Render logs
        console.error('Error generating PDF:', error.response ? error.response.data : error.message);
        res.status(500).send('Server Error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Microservice running on port ${PORT}`));