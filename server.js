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
  console.log("📦 Données reçues :", JSON.stringify(data, null, 2));

  // 🔎 Extraction infos utilisateur
  const userInfoRaw = data["Informations Utilisateur"] || [];
  const getField = (label) =>
    userInfoRaw.find(f => f.label?.toLowerCase().trim() === label.toLowerCase().trim())?.value || "";

  const firstName = getField("Prénom");
  const lastName = getField("Nom");
  const email = getField("E-mail");

  // 🧼 Nettoyage du nom pour le fichier
  const clean = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `responses-${clean(lastName)}-${clean(firstName)}-${timestamp}.json`;

  try {
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");
    fs.writeFileSync(`./data/${filename}`, JSON.stringify(data, null, 2));

    // 💬 Bloc commentaire (géré en dehors de .map)
    let commentaireHTML = "";
    if ("Commentaire" in data) {
      const comment = String(data["Commentaire"]).trim();
      commentaireHTML = `
        <h3>🗨️ Commentaire de l'utilisateur</h3>
        <p style="padding: 1rem; background-color: #f4f4f4; border-left: 4px solid #2C6474;">
          ${comment || "<em>Aucun commentaire renseigné.</em>"}
        </p>
        <hr>
      `;
    }

    // 📋 Génération du HTML des autres blocs
    let htmlThemes = "";
let htmlResumeTable = "";

Object.entries(data).forEach(([theme, responses]) => {
  const normalized = theme.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (normalized === "commentaire") return;

  // Résumé → extrait dans htmlResumeTable uniquement
  if (normalized.includes("resume")) {
    htmlResumeTable = `
      <h3>${theme}</h3>
      <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
        <thead>
          <tr style="background-color: #333; color: white;">
            <th style="padding: 8px; border: 1px solid #ccc;">Thème</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Score</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Recommandation</th>
          </tr>
        </thead>
        <tbody>
          ${responses.map(r => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ccc;">${r.theme}</td>
              <td style="padding: 8px; border: 1px solid #ccc;">${r.score}</td>
              <td style="padding: 8px; border: 1px solid #ccc;">${r.recommendation}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    return;
  }

  // Infos utilisateur
  const isInfo = Array.isArray(responses) && responses.every(r => "label" in r && "value" in r);
  if (isInfo) {
    htmlThemes += `<h3>${theme}</h3><ul>${responses.map(r => `<li><strong>${r.label} :</strong> ${r.value}</li>`).join("")}</ul><hr>`;
    return;
  }

  // Notes scorées
  const isScored = Array.isArray(responses) && responses.every(r => "note" in r && "question" in r);
  if (isScored) {
    const avg = (
      responses.reduce((sum, r) => sum + parseFloat(r.note), 0) / responses.length
    ).toFixed(2);
    htmlThemes += `<h3>${theme}</h3><p><strong>Note moyenne :</strong> ${avg} / 5</p><ul>${responses.map(r => `<li>(${r.note}/5) - ${r.question}</li>`).join("")}</ul><hr>`;
  }
});


    // 🔢 Moyenne globale
    let allNotes = [];
    Object.values(data).forEach((responses) => {
      if (Array.isArray(responses)) {
        const isScored = responses.every(r => r && typeof r === "object" && "note" in r && "question" in r);
        if (isScored) {
          const notes = responses.map(r => parseFloat(r.note)).filter(n => !isNaN(n));
          allNotes = allNotes.concat(notes);
        }
      }
    });

    let globalAverageHTML = "";
    if (allNotes.length > 0) {
      const globalAverage = (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2);
      globalAverageHTML = `<hr><h2>🎯 Note moyenne globale : ${globalAverage} / 5</h2>`;
    }

    // ✉️ Envoi du mail
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
      html: `
        <h2>Résumé des réponses</h2>
        ${htmlThemes}
        ${commentaireHTML}
        <h2>Résumé synthétique</h2>
        ${htmlResumeTable}
        ${globalAverageHTML}
      `,
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
