require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post("/submit", async (req, res) => {
  const data = req.body;
  console.log("RAW DATA", JSON.stringify(data, null, 2));

  // DEBUG brut
  console.log("📦 Données reçues :", JSON.stringify(data, null, 2));

  // Extraction des infos utilisateur
  const userInfoRaw = data["Informations Utilisateur"] || [];
  const getField = (labelName) =>
    userInfoRaw.find(f =>
      f.label && f.label.toLowerCase().trim() === labelName.toLowerCase().trim()
    )?.value || "";

  const firstName = getField("Prénom");
  const lastName = getField("Nom");
  const email = getField("E-mail");

  // Nettoyage nom pour nom de fichier
  const clean = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `responses-${clean(lastName)}-${clean(firstName)}-${timestamp}.json`;

  try {
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");
    fs.writeFileSync(`./data/${filename}`, JSON.stringify(data, null, 2));

// GÉNÉRATION DU RÉSUMÉ HTML
console.log("📂 Thèmes reçus :", Object.keys(data));
console.log("📄 Type de 'Informations Utilisateur' :", typeof data["Informations Utilisateur"]);
console.log("📦 Contenu brut :", JSON.stringify(data["Informations Utilisateur"], null, 2));
console.log("🧪 Détail Infos Utilisateur reçues :", JSON.stringify(data["Informations Utilisateur"], null, 2));

    // GÉNÉRATION DU RÉSUMÉ HTML
    const htmlContent = Object.entries(data).map(([theme, responses]) => {
      if (!Array.isArray(responses)) return ""; // skip si pas un tableau

      const isInfo = responses.every(r => r && typeof r === "object" && "label" in r && "value" in r);
      const isScored = responses.every(r => r && typeof r === "object" && "note" in r && "question" in r);

      if (isInfo) {
        const infoList = responses.map((r, i) => {
          if (!r.label || r.value === undefined) {
            console.warn(`⚠️ Mauvais format dans Informations Utilisateur à l'index ${i}:`, r);
          }
          return `<li><strong>${r.label ?? "??"} :</strong> ${r.value ?? "??"}</li>`;
        }).join("");
      
        return `<h3>${theme}</h3><ul>${infoList}</ul>`;
      }

      if (isScored) {
        const average = (
          responses.reduce((sum, r) => sum + parseFloat(r.note), 0) / responses.length
        ).toFixed(2);

        const questionsList = responses.map((r) =>
          `<li>(${r.note}/5) - ${r.question}</li>`).join("");

        return `<h3>${theme}</h3><p><strong>Note moyenne :</strong> ${average} / 5</p><ul>${questionsList}</ul>`;
      }

      // fallback
      return `<h3>${theme}</h3><pre>${JSON.stringify(responses, null, 2)}</pre>`;
    }).join("<hr>");

    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.OUTLOOK_USER,
        pass: process.env.OUTLOOK_PASS,
      },
    });

    const recipients = [];

    if (email) recipients.push(email);
    if (process.env.ADMIN_BCC_EMAIL) recipients.push(process.env.ADMIN_BCC_EMAIL);

    const mailOptions = {
    from: `Krialys Form <${process.env.OUTLOOK_USER}>`,
    to: recipients,
    subject: `📝 Résumé du diagnostic de ${firstName} ${lastName}`.trim(),
    html: `<h2>Résumé des réponses</h2>${htmlContent}`,
    };


    await transporter.sendMail(mailOptions);
    console.log("✅ Email envoyé avec succès !");
    res.status(200).json({ message: "Réponses enregistrées et email envoyé avec succès." });

  } catch (err) {
    console.error("❌ Erreur backend :", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur opérationnel sur http://localhost:${PORT}`);
});
