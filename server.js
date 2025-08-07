require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Fonction de nettoyage des titres des formulaires 
const clean = str =>
  str.normalize("NFD") // enlève accents
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "") // enlève caractères spéciaux
    .replace(/\s+/g, "-"); // remplace espaces par tirets


// Submit route for diagnostic
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

  // Nettoyage du nom pour le fichier
  const clean = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `responses-${clean(lastName)}-${clean(firstName)}-${timestamp}.json`;

  // Fonction de recommandation
  function getRecommendation(score) {
    const s = parseFloat(score);
    if (isNaN(s)) return "Score invalide";
    if (s >= 4.5) return "Niveau 5/5 : Optimized";
    if (s >= 3.5) return "Niveau 4/5 : Quantitatively Managed / Measured";
    if (s >= 2.5) return "Niveau 3/5 : Defined";
    if (s >= 1.5) return "Niveau 2/5 : Managed";
    return "Niveau 1/5 : Initial";
  }

  try {
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");
    fs.writeFileSync(`./data/${filename}`, JSON.stringify(data, null, 2));

    // Bloc commentaire
    let Comment = "";
    if ("Commentaire" in data) {
      const comment = String(data["Commentaire"]).trim();
      Comment = `
        <h2>Commentaire de l'utilisateur</h2>
        <p style="padding: 1rem; background-color: #f4f4f4; border-left: 4px solid #2C6474;">
          ${comment || "<em>Aucun commentaire renseigné.</em>"}
        </p>
        <hr>
      `;
    }

    
  // Génération des blocs
  let ResponsesByThemes = "";
  let Resume = "";

  // Nouveau tableau unique pour toutes les réponses scorées
  let allScoredRows = [];

  Object.entries(data).forEach(([theme, responses]) => {
    const normalized = theme.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (normalized === "commentaire") return;

    if (normalized.includes("resume")) {
      Resume = `
        <h2>Résumé synthétique</h2>
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
                <td style="padding: 8px; border: 1px solid #ccc;">${getRecommendation(r.score)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      return;
    }

    const isInfo = Array.isArray(responses) && responses.every(r => "label" in r && "value" in r);
    if (isInfo) {
      ResponsesByThemes += `<h2>${theme}</h2><ul>${responses.map(r => `<li><strong>${r.label} :</strong> ${r.value}</li>`).join("")}</ul><hr>`;
      return;
    }

    const isScored = Array.isArray(responses) && responses.every(r => "note" in r && "question" in r);
    if (isScored) {
      responses.forEach(r => {
        const parts = r.question.match(/^(\d+)[^\w]*(.*)$/);
        const number = parts ? parts[1] : "";
        const questionText = parts ? parts[2] : r.question;
      
        allScoredRows.push(`
          <tr>
            <td style="padding: 8px; border: 1px solid #ccc;">${theme}</td>
            <td style="padding: 8px; border: 1px solid #ccc; text-align:center;">${number}</td>
            <td style="padding: 8px; border: 1px solid #ccc;">${questionText}</td>
            <td style="padding: 8px; border: 1px solid #ccc; text-align:center;">${parseFloat(r.note)}</td>
          </tr>
        `);
      });
      
    }
  });

  // Une seule table pour toutes les réponses scorées
  if (allScoredRows.length > 0) {
    ResponsesByThemes += `
      <h2>Détail des réponses par thématiques</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
        <thead>
          <tr style="background-color: #333; color: white;">
            <th style="padding: 8px; border: 1px solid #ccc;">Thème</th>
             <th style="padding: 8px; border: 1px solid #ccc;">N°</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Question</th>
            <th style="padding: 8px; border: 1px solid #ccc;">Note</th>
          </tr>
        </thead>
        <tbody>
          ${allScoredRows.join("")}
        </tbody>
      </table>
      <hr>
    `;
    }

    // Moyenne globale
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

    let GlobalAverage = "";
    if (allNotes.length > 0) {
      const globalAverage = (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2);
      GlobalAverage = `<hr><h2>🎯 Note moyenne globale : ${globalAverage} / 5</h2>`;
    }

    
// Génération fichier Excel
const workbook = new ExcelJS.Workbook();

// Feuille : Réponses par thématique
const sheetResponses = workbook.addWorksheet("Réponses par thématique");
sheetResponses.columns = [
  { header: "Thème", key: "theme", width: 30 },
  { header: "N°", key: "number", width: 10 },
  { header: "Question", key: "question", width: 80 },
  { header: "Note", key: "note", width: 10 },
];

Object.entries(data).forEach(([theme, responses]) => {
  const isScored = Array.isArray(responses) && responses.every(r => "note" in r && "question" in r);
  if (isScored) {
    responses.forEach(r => {
      const parts = r.question.match(/^(\d+)[^\w]*(.*)$/);
const number = parts ? parts[1] : "";
const questionText = parts ? parts[2] : r.question;

sheetResponses.addRow({
  theme,
  number,
  question: questionText,
  note: parseFloat(r.note),
});

    });
  }
});

// Feuille : Résumé synthétique
const sheetSummary = workbook.addWorksheet("Résumé synthétique");
sheetSummary.columns = [
  { header: "Thème", key: "theme", width: 40 },
  { header: "Score", key: "score", width: 10 },
  { header: "Recommandation", key: "recommendation", width: 60 },
];

Object.entries(data).forEach(([theme, responses]) => {
  const normalized = theme.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("resume")) {
    responses.forEach(r => {
      sheetSummary.addRow({
        theme: r.theme,
        score: r.score,
        recommendation: getRecommendation(r.score),
      });
    });
  }
});

// Sauvegarde temporaire
const excelFilePath = path.join(__dirname, "data", filename.replace(".json", ".xlsx"));
await workbook.xlsx.writeFile(excelFilePath);


    // Configuration transporteur
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.OUTLOOK_USER,
        pass: process.env.OUTLOOK_PASS,
      },
    });

    // Admin email
    const recipientsAdmin = [];
    if (process.env.ADMIN_BCC_EMAIL) recipientsAdmin.push(process.env.ADMIN_BCC_EMAIL);

    const mailOptionsAdmin = {
      from: `Krialys Form <${process.env.OUTLOOK_USER}>`,
      to: recipientsAdmin,
      subject: `📝 Résumé complet du diagnostic de ${firstName} ${lastName}`.trim(),
      html: `
        ${ResponsesByThemes}
        ${Comment}
        ${Resume}
        ${GlobalAverage}
      `,
      attachments: [
        {
          filename: "diagnostic.xlsx",
          path: excelFilePath,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
      ]
    };

    // User email
    const mailOptionsUser = {
      from: `Krialys Form <${process.env.OUTLOOK_USER}>`,
      to: email,
      subject: `📊 Résumé de votre diagnostic`,
      html: `
    <!DOCTYPE html>
      <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="fr">
      <head>
        <title></title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="only light">
        <meta name="supported-color-schemes" content="light">
        <!--[if mso]>
        <style>
          body, table, td { background-color: #ff8426 !important; }
        </style>
        <![endif]-->
      </head>
      <body style="background-color: #ff8426; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
        <div style="display:none; color:#ff8426; background-color:#ff8426;"></div>
        <table class="nl-container" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
          <tbody>
            <tr>
              <td style="background-color: #ff8426;">
                <!-- BLOC LOGO -->
                <table class="row row-1" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                  <tbody>
                    <tr>
                      <td style="background-color: #ff8426;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #ff8426; padding-bottom: 30px; padding-top: 30px; vertical-align: top;">
                                <table class="image_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                                  <tr>
                                    <td class="pad" style="background-color: #ff8426;">
                                      <div class="alignment" align="center">
                                        <div style="max-width: 155px;">
                                          <img src="https://0a924af5d3.imgdist.com/pub/bfra/5yitdg4a/uhc/akj/qpt/Logo_Krialys_2022_blanc.png" style="display: block; height: auto; border: 0; width: 100%; background: #ff8426;" width="155" alt title height="auto">
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- BLOC REMERCIEMENT -->
                <table class="row row-2" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                  <tbody>
                    <tr>
                      <td style="background-color: #ff8426;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #ff8426; padding-bottom: 5px; padding-top: 5px; vertical-align: top;">
                                <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                                  <tr>
                                    <td class="pad" style="background-color: #ff8426;">
                                      <div style="color:#ffffff; font-family:Arial, Helvetica, sans-serif;font-size:35px; font-weight:400; line-height:1.2; text-align:center;">
                                        <p style="margin: 0;">Merci d'avoir complété le questionnaire</p>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- BLOC TEXTE SUIVANT -->
                <table class="row row-3" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                  <tbody>
                    <tr>
                      <td style="background-color: #ff8426;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #ff8426; padding-bottom: 30px; vertical-align: top;">
                                <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                                  <tr>
                                    <td class="pad" style="background-color: #ff8426;">
                                      <div style="color:#ffffff; font-family:Arial, Helvetica, sans-serif;font-size:16px;font-weight:400; line-height:1.2;text-align:center;">
                                        <p style="margin: 0;">Nous vous recontacterons pour prendre rendez-vous afin de vous présenter les résultats de votre diagnostic</p>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- BLOC LINKEDIN LIVE -->
                <table class="row row-4" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                  <tbody>
                    <tr>
                      <td style="background-color: #e7faf8;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #e7faf8; padding-bottom: 40px; padding-left: 20px; padding-right: 20px; padding-top: 50px; vertical-align: top;">
                                <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                                  <tr>
                                    <td class="pad" style="background-color: #e7faf8; padding-bottom:10px;width:100%;padding-right:0px;padding-left:0px;">
                                      <div class="alignment" align="center">
                                        <div class="fullWidth" style="max-width: 515px;">
                                          <img src="https://0a924af5d3.imgdist.com/pub/bfra/5yitdg4a/ciz/0tg/1j2/DE%CC%81COUVREZ%20LES%20REPLAY%20DE%20NOS%20LINKEDIN%20LIVE-4-min.png" style="display: block; height: auto; border: 0; width: 100%; border-radius: 8px; background: #e7faf8;" width="515" alt title height="auto">
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                                <table class="heading_block block-2" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                                  <tr>
                                    <td class="pad" style="background-color: #e7faf8; padding-bottom:10px;padding-top:20px;text-align:center;width:100%;">
                                      <h2 style="margin: 0; color: #2c6474; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 24px; font-weight: 700; line-height: 1.5; text-align: left;">
                                        Découvrez nos LinkedIn Live
                                      </h2>
                                    </td>
                                  </tr>
                                </table>
                                <table class="paragraph_block block-3" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                                  <tr>
                                    <td class="pad" style="background-color: #e7faf8;">
                                      <div style="color:#444a5b; font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:16px;font-weight:400;line-height:1.5;text-align:left;">
                                        <p style="margin: 0;">Vous avez manqué notre dernier LinkedIn Live ?&nbsp;</p>
                                        <p style="margin: 0;">Pas de panique, les replays sont disponibles ! 😉</p>
                                        <p style="margin: 0;">(Re)découvrez les échanges, les retours d'expériences concrets et les conseils partagés par nos intervenants.&nbsp;</p>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                                <table class="button_block block-4" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                                  <tr>
                                    <td class="pad" style="background-color: #e7faf8; padding-bottom:10px;padding-top:20px;text-align:center;">
                                      <div class="alignment" align="center">
                                        <!--[if mso]>
                                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"  href="https://www.youtube.com/@Orkestra-data-krialys"  style="height:60px;width:235px;v-text-anchor:middle;" arcsize="17%" fillcolor="#00b0a6">
                                          <v:stroke dashstyle="Solid" weight="0px" color="#7747FF"/>
                                          <w:anchorlock/>
                                          <v:textbox inset="0px,0px,0px,0px">
                                            <center dir="false" style="color:#ffffff;font-family:Arial, sans-serif;font-size:17px">
                                        <![endif]-->
                                        <a href="https://www.youtube.com/@Orkestra-data-krialys" target="_blank" style="background-color: #00b0a6; border-radius: 10px; color: #ffffff; display: inline-block; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 17px; font-weight: 400; padding: 13px 50px; text-align: center; text-decoration: none; letter-spacing: normal; word-break: keep-all; line-height: 34px;">
                                          Nos LinkedIn Live
                                        </a>
                                        <!--[if mso]>
                                            </center>
                                          </v:textbox>
                                        </v:roundrect>
                                        <![endif]-->
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- BLOC CONTACT -->
                <table class="row row-5" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                  <tbody>
                    <tr>
                      <td style="background-color: #e7faf8;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #e7faf8; padding-bottom: 35px; padding-top: 20px; vertical-align: top;">
                                <table class="html_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #e7faf8;">
                                  <tr>
                                    <td class="pad" style="background-color: #e7faf8;">
                                      <div style="font-family:Arial, Helvetica, sans-serif;text-align:center;">
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                                          <tr>
                                            <td align="center">
                                              <table width="700" cellpadding="0" cellspacing="0" border="0" style="background-color:#2C6474; border-radius:10px; padding: 10px;">
                                                <tr>
                                                  <td align="center" valign="middle" style="padding: 10px;">
                                                    <table cellpadding="0" cellspacing="0" border="0">
                                                      <tr>
                                                        <td align="center" style="background-color: #E7FAF8; width: 30px; height: 30px; border-radius: 5px;">
                                                          <img src="https://i.ibb.co/SDp2ymbF/globe.png" alt="web icon" width="20" height="20" style="display: block;" />
                                                        </td>
                                                        <td style="padding-left: 10px;">
                                                          <a href="https://www.krialys.com" style="color: #DCF5F2; text-decoration: none; font-family: Arial, sans-serif;">www.krialys.com</a>
                                                        </td>
                                                      </tr>
                                                    </table>
                                                  </td>
                                                  <td align="center" valign="middle" style="padding: 10px;">
                                                    <table cellpadding="0" cellspacing="0" border="0">
                                                      <tr>
                                                        <td align="center" style="background-color: #E7FAF8; width: 30px; height: 30px; border-radius: 5px;">
                                                          <img src="https://i.ibb.co/yc2zKH52/call.png" alt="phone icon" width="20" height="20" style="display: block;" />
                                                        </td>
                                                        <td style="padding-left: 10px;">
                                                          <span style="color: #DCF5F2; font-family: Arial, sans-serif;">06 50 11 55 80</span>
                                                        </td>
                                                      </tr>
                                                    </table>
                                                  </td>
                                                  <td align="center" valign="middle" style="padding: 10px;">
                                                    <table cellpadding="0" cellspacing="0" border="0">
                                                      <tr>
                                                        <td align="center" style="background-color: #E7FAF8; width: 30px; height: 30px; border-radius: 5px;">
                                                          <img src="https://i.ibb.co/Csnk41fY/email.png" alt="mail icon" width="20" height="20" style="display: block;" />
                                                        </td>
                                                        <td style="padding-left: 10px;">
                                                          <a href="mailto:symphony@krialys.com" style="color: #DCF5F2; text-decoration: none; font-family: Arial, sans-serif;">symphony@krialys.com</a>
                                                        </td>
                                                      </tr>
                                                    </table>
                                                  </td>
                                                </tr>
                                              </table>
                                            </td>
                                          </tr>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <!-- FOOTER ORANGE -->
                <table class="row row-6" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                  <tbody>
                    <tr>
                      <td style="background-color: #ff8426;">
                        <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426; width: 775px; margin: 0 auto;">
                          <tbody>
                            <tr>
                              <td class="column column-1" width="100%" style="background-color: #ff8426; padding-bottom: 5px; padding-top: 15px; vertical-align: top;">
                                <table class="html_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ff8426;">
                                  <tr>
                                    <td class="pad" style="background-color: #ff8426;">
                                      <div style="width: 100%; background-color: #FF8426; padding: 10px 0; text-align: center;">
                                        &nbsp;
                                      </div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
      `,
    };

    if (recipientsAdmin.length > 0) await transporter.sendMail(mailOptionsAdmin);
    if (email) await transporter.sendMail(mailOptionsUser);

    console.log("✅ Emails envoyés avec succès !");
    res.status(200).json({ message: "Réponses enregistrées et emails envoyés avec succès." });

  } catch (err) {
    console.error("❌ Erreur backend :", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Submit route for radar forms
app.post("/submit-radar", async (req, res) => {
  try {
    console.dir(req.body, { depth: null });
    const { questions, comment, globalAverage, formNum } = req.body;

    // Titre du formulaire
    const formTitles = {
      1: "Évaluation Stratégique et Organisationnelle",
      2: "Évaluation Opérationnelle Métiers",
      3: "Évaluation Technique et Data Management",
    };
    const formTitle = formTitles[formNum] || `Formulaire ${formNum}`;

    const { user = {} } = req.body;

    // Format HTML du tableau récapitulatif
    let rows = "";
    questions.forEach(theme => {
      theme.responses.forEach(r => {
        const questionParts = r.question.match(/^(\d+)[^\w]*(.*)$/);
        const questionNumber = questionParts ? questionParts[1] : "";
        const questionText = questionParts ? questionParts[2] : r.question;

        rows += `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${theme.theme}</td>
          <td style="border:1px solid #ddd;padding:8px; text-align:center;">${questionNumber}</td>
          <td style="border:1px solid #ddd;padding:8px;">${questionText}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">${r.note}</td>
        </tr>`;

      });
    });

    const html = `
      <h2 style="font-family:sans-serif;">Nouveau diagnostic de maturité reçu pour ${user.company || "Entreprise inconnue"} : ${formTitle}</h2>
      <p><strong>Nom :</strong> ${user.lastName || "Non renseigné"}</p>
      <p><strong>Prénom:</strong> ${user.firstName || "Non renseigné"}</p>
      <p><strong>Email :</strong> ${user.email || "Non renseigné"}</p>
      <p><strong>Téléphone :</strong> ${user.phone || "Non renseigné"}</p>
      <p><strong>Entreprise :</strong> ${user.company || "Non renseigné"}</p>
      <p><strong>Note moyenne :</strong> ${globalAverage || "N/A"}</p>
      <p><strong>Commentaire :</strong> ${comment || "<em>Aucun commentaire</em>"}</p>
      <h3 style="font-family:sans-serif;margin-top:2rem;">Détail des réponses :</h3>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;">
        <thead>
          <tr>
            <th style="border:1px solid #ddd;padding:8px;background:#eee;">Thème</th>
            <th style="border:1px solid #ddd;padding:8px;background:#eee;">N°</th>
            <th style="border:1px solid #ddd;padding:8px;background:#eee;">Question</th>
            <th style="border:1px solid #ddd;padding:8px;background:#eee;">Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Génération du fichier Excel 
    const workbook = new ExcelJS.Workbook();

    // Feuille 1 : Réponses
    const sheet1 = workbook.addWorksheet("Réponses");
    sheet1.columns = [
      { header: "Thème", key: "theme", width: 30 },
      { header: "N°", key: "number", width: 10 },
      { header: "Question", key: "question", width: 80 },
      { header: "Note", key: "note", width: 10 }
    ];
    questions.forEach(theme => {
      theme.responses.forEach(r => {
        const parts = r.question.match(/^(\d+)[^\w]*(.*)$/);
        const number = parts ? parts[1] : "";
        const questionText = parts ? parts[2] : r.question;
        
        sheet1.addRow({
          theme: theme.theme,
          number,
          question: questionText,
          note: parseFloat(r.note)
        });
        
      });
    });

    // Feuille 2 : Informations utilisateur
    const sheet2 = workbook.addWorksheet("Informations");
    sheet2.addRow(["Champ", "Valeur"]);
    sheet2.addRow(["Prénom", user.firstName || ""]);
    sheet2.addRow(["Nom", user.lastName || ""]);
    sheet2.addRow(["Email", user.email || ""]);
    sheet2.addRow(["Téléphone", user.phone || ""]);
    sheet2.addRow(["Entreprise", user.company || ""]);
    sheet2.addRow(["Note moyenne", globalAverage || ""]);
    sheet2.addRow(["Commentaire", comment || ""]);

    // const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `radar-${clean(formTitle)}.xlsx`;
    const filePath = path.join(__dirname, "data", fileName);
    await workbook.xlsx.writeFile(filePath);

    // Configuration transporteur
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.OUTLOOK_USER,
        pass: process.env.OUTLOOK_PASS,
      },
    });

    // Envoi de l’e-mail
    await transporter.sendMail({
      from: `"Krialys Radar de maturité" <${process.env.OUTLOOK_USER}>`,
      to: process.env.ADMIN_BCC_EMAIL,
      subject: `Radar de maturité - ${formTitle}`,
      html,
      attachments: [
        {
          filename: "radar-.xlsx",
          path: filePath,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
      ]
    });

    // Nettoyage du fichier Excel après envoi
    fs.unlink(filePath, err => {
      if (err) console.error("❌ Erreur suppression Excel radar :", err);
    });

    res.status(200).json({ message: "Radar de maturité envoyé avec succès" });

  } catch (error) {
    console.error("Erreur envoi radar de maturité :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur opérationnel sur http://localhost:${PORT}`);
});
