require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendTestMail() {
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // Utilise STARTTLS
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Test Krialys" <${process.env.OUTLOOK_USER}>`,
      to: process.env.TEST_RECIPIENT,
      subject: "✅ Test d'envoi depuis Outlook Professionnel",
      text: "Ceci est un test envoyé via SMTP Office365.",
    });

    console.log("✅ Mail envoyé :", info.messageId);
  } catch (error) {
    console.error("❌ Erreur lors de l’envoi :", error);
  }
}

sendTestMail();
