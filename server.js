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

    // Génération des blocs
    let htmlThemes = "";
    let htmlResumeTable = "";

    Object.entries(data).forEach(([theme, responses]) => {
      const normalized = theme.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      if (normalized === "commentaire") return;

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
        htmlThemes += `<h3>${theme}</h3><ul>${responses.map(r => `<li><strong>${r.label} :</strong> ${r.value}</li>`).join("")}</ul><hr>`;
        return;
      }

      // Notes scorées
      const isScored = Array.isArray(responses) && responses.every(r => "note" in r && "question" in r);
      if (isScored) {
        const avg = (
          responses.reduce((sum, r) => sum + parseFloat(r.note), 0) / responses.length
        ).toFixed(2);

        htmlThemes += `
          <h3>${theme}</h3>
          <p><strong>Note moyenne :</strong> ${avg} / 5</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
            <thead>
              <tr style="background-color: #333; color: white;">
                <th style="padding: 8px; border: 1px solid #ccc;">Question</th>
                <th style="padding: 8px; border: 1px solid #ccc;">Note</th>
              </tr>
            </thead>
            <tbody>
              ${responses.map(r => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #ccc;">${r.question}</td>
                  <td style="padding: 8px; border: 1px solid #ccc;">${r.note} / 5</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <hr>
        `;
      }
    });

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

    let globalAverageHTML = "";
    if (allNotes.length > 0) {
      const globalAverage = (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2);
      globalAverageHTML = `<hr><h2>🎯 Note moyenne globale : ${globalAverage} / 5</h2>`;
    }

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
        <h2>Résumé des réponses par thématique</h2>
        ${htmlThemes}
        ${commentaireHTML}
        <h2>Résumé synthétique</h2>
        ${htmlResumeTable}
        ${globalAverageHTML}
      `,
    };

    // Utilisateur email
    const mailOptionsUser = {
      from: `Krialys Form <${process.env.OUTLOOK_USER}>`,
      to: email,
      subject: `📊 Résumé de votre diagnostic`,
      html: `
    <!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      lang="en">

<head>
  <title>Diagnostic de maturité</title>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 
    ===============================
     1) MÉTA-TAGS POUR MODE CLAIR
    ===============================
    Ils indiquent à certains clients (dont Outlook sur Windows 10/11) 
    qu’ils ne doivent PAS basculer en mode sombre automatique 
    ni altérer vos fonds clairs. 
  -->
  <!--[if !mso]><!-->
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <!--<![endif]-->

  <!--[if mso]>
    <!-- 
      Outlook Windows peut toujours « doucher » vos couleurs claires. 
      On surcharge ici le CSS pour forcer nos ambiances orange / bleu clair. 
    -->
    <style>
      /* On cible body, table, td (tout ce qui a un fond) pour ne PAS être passé (inversé) en gris foncé. */
      body, table, td {
        background-color: #ffffff !important;
        color-scheme: light !important;
      }
      /* Classes spécifiques pour forcer nos couleurs si besoin */
      .bg-orange    { background-color: #ff8426 !important; }
      .bg-lightblue { background-color: #e7faf8 !important; }
    </style>
  <![endif]-->

  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #ffffff; /* Fond général blanc */
    }
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: inherit !important;
    }
    #MessageViewBody a {
      color: inherit;
      text-decoration: none;
    }
    p {
      line-height: inherit;
    }
    sup, sub {
      font-size: 75%;
      line-height: 0;
    }
    @media (max-width:768px) {
      .image_block div.fullWidth {
        max-width: 100% !important;
      }
      .row-content {
        width: 100% !important;
      }
      .stack .column {
        width: 100%;
        display: block;
      }
      .row-4 .column-1 .block-2.heading_block h2 {
        font-size: 24px !important;
      }
      .row-4 .column-1 {
        padding: 20px !important;
      }
    }
  </style>

  <!--[if mso]>
    <style>
      sup, sub {
        font-size: 100% !important;
      }
      sup { mso-text-raise: 10% }
      sub { mso-text-raise: -10% }
    </style>
  <![endif]-->

</head>

<body style="margin:0; padding:0; -webkit-text-size-adjust:none; text-size-adjust:none;">

  <!-- CONTENEUR PRINCIPAL -->
  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
         style="mso-table-lspace:0pt; mso-table-rspace:0pt; background-color:#ffffff;">
    <tbody>
      <tr>
        <td>

          <!-- ========================= -->
          <!-- ROW-1 (ORANGE #ff8426) -->
          <!-- ========================= -->
          <!-- 
            On met BOTH ATTRIBUTES : 
             • bgcolor="#ff8426" (pour Outlook)
             • style="background-color:#ff8426" (pour tous les autres).
            Pour éviter le mode sombre, on ajoute aussi une class "bg-orange" qu’Outlook
            est forcé de respecter dans le <style conditionnel> du head.
          -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#ff8426"
                 style="background-color:#ff8426;"
                 class="bg-orange">
            <tr>
              <td style="padding:0; margin:0;">

                <!--[if mso]>
                <!-- 
                  On insère un RECTANGLE VML qui couvre TOUT le <td> en orange EXACTEMENT #ff8426,
                  sans transparence. On positionne l’intégralité du contenu à l’intérieur du v:textbox.
                -->
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#ff8426">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#ff8426; mso-background-alt:#ff8426;">
                  <tr>
                    <td style="text-align:center; padding-top:30px; padding-bottom:30px;">
                      <div style="max-width:155px; margin:0 auto;">
                        <img src="https://0a924af5d3.imgdist.com/pub/bfra/5yitdg4a/uhc/akj/qpt/Logo_Krialys_2022_blanc.png"
                             width="155"
                             style="display:block; border:0; width:100%; height:auto;"
                             alt="Logo Krialys">
                      </div>
                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
          </table>


          <!-- ========================= -->
          <!-- ROW-2 (ORANGE #ff8426) -->
          <!-- ========================= -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#ff8426"
                 style="background-color:#ff8426;"
                 class="bg-orange">
            <tr>
              <td style="padding:0; margin:0;">

                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#ff8426">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#ff8426; mso-background-alt:#ff8426;">
                  <tr>
                    <td style="text-align:center; padding-top:5px; padding-bottom:5px;">
                      <div style="color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:35px; font-weight:400; line-height:1.2;">
                        <p style="margin:0;">Merci d'avoir complété le questionnaire</p>
                      </div>
                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
          </table>


          <!-- ========================= -->
          <!-- ROW-3 (ORANGE #ff8426) -->
          <!-- ========================= -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#ff8426"
                 style="background-color:#ff8426;"
                 class="bg-orange">
            <tr>
              <td style="padding:0; margin:0;">

                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#ff8426">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#ff8426; mso-background-alt:#ff8426;">
                  <tr>
                    <td style="text-align:center; padding-top:0; padding-bottom:30px;">
                      <div style="color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:400; line-height:1.2;">
                        <p style="margin:0;">
                          Nous vous recontacterons pour prendre rendez-vous afin de vous présenter les résultats de votre diagnostic
                        </p>
                      </div>
                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
          </table>


          <!-- =================================== -->
          <!-- ROW-4 (BLEU CLAIR #e7faf8) – même méthode -->
          <!-- =================================== -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#e7faf8"
                 style="background-color:#e7faf8;"
                 class="bg-lightblue">
            <tr>
              <td style="padding:0; margin:0; position:relative;">

                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#e7faf8">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#e7faf8; mso-background-alt:#e7faf8;">
                  <tr>
                    <td style="padding:50px 20px 40px 20px; text-align:left; font-family:Arial, Helvetica, sans-serif; color:#000000;">
                      <div style="max-width:735px; margin:0 auto;">
                        <img src="https://0a924af5d3.imgdist.com/pub/bfra/5yitdg4a/ciz/0tg/1j2/DE%CC%81COUVREZ%20LES%20REPLAY%20DE%20NOS%20LINKEDIN%20LIVE-4-min.png"
                             width="735"
                             style="display:block; border:0; width:100%; height:auto; border-radius:8px;"
                             alt="Image LinkedIn Live">
                      </div>

                      <h2 style="margin:20px 0 10px 0; color:#2c6474; font-size:24px; font-weight:700; line-height:1.5;">
                        Découvrez nos LinkedIn Live
                      </h2>

                      <p style="margin:0 0 20px 0; color:#444a5b; font-size:16px; line-height:1.5;">
                        Vous avez manqué notre dernier LinkedIn Live ?<br>
                        Pas de panique, les replays sont disponibles ! 😉<br>
                        (Re)découvrez les échanges, les retours d’expériences concrets et les conseils partagés par nos intervenants.
                      </p>

                      <div style="text-align:center;">
                        <!-- Bouton VML pour Outlook -->
                        <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                                       xmlns:w="urn:schemas-microsoft-com:office:word"
                                       href="https://www.youtube.com/@Orkestra-data-krialys"
                                       style="height:60px; width:235px; v-text-anchor:middle;"
                                       arcsize="17%" fillcolor="#00b0a6" stroke="false">
                            <w:anchorlock/>
                            <v:textbox inset="0,0,0,0">
                              <center style="color:#ffffff; font-family:Arial, Helvetica, sans-serif; font-size:17px;">
                                Nos LinkedIn Live
                              </center>
                            </v:textbox>
                          </v:roundrect>
                        <![endif]-->
                        <!--[if !mso]><!-- -->
                          <a href="https://www.youtube.com/@Orkestra-data-krialys"
                             style="display:inline-block;
                                    background-color:#00b0a6;
                                    color:#ffffff;
                                    font-family:Arial, Helvetica, sans-serif;
                                    font-size:17px;
                                    font-weight:400;
                                    line-height:60px;
                                    text-align:center;
                                    text-decoration:none;
                                    width:235px;
                                    border-radius:10px;">
                            Nos LinkedIn Live
                          </a>
                        <!--<![endif]-->
                      </div>

                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
          </table>


          <!-- =================================== -->
          <!-- ROW-5 (BLEU CLAIR #e7faf8) – contacts -->
          <!-- =================================== -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#e7faf8"
                 style="background-color:#e7faf8;"
                 class="bg-lightblue">
            <tr>
              <td style="padding:20px; margin:0;">

                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#e7faf8">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#e7faf8; mso-background-alt:#e7faf8;">
                  <tr>
                    <td style="text-align:center; font-family:Arial, Helvetica, sans-serif; color:#000000;">
                      <table width="700" cellpadding="10" cellspacing="0" border="0"
                             style="background-color:#2C6474; border-radius:10px; margin:0 auto; mso-background-alt:#2C6474;">
                        <tr>
                          <td align="center" valign="middle" style="padding:10px;">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td align="center"
                                    style="background-color:#E7FAF8; width:30px; height:30px; border-radius:5px;">
                                  <img src="https://i.ibb.co/SDp2ymbF/globe.png"
                                       alt="web icon"
                                       width="20"
                                       height="20"
                                       style="display:block; border:0;" />
                                </td>
                                <td style="padding-left:10px;">
                                  <a href="https://www.krialys.com"
                                     style="color:#DCF5F2; text-decoration:none; font-family:Arial, Helvetica, sans-serif; font-size:14px;">
                                    www.krialys.com
                                  </a>
                                </td>
                              </tr>
                            </table>
                          </td>

                          <td align="center" valign="middle" style="padding:10px;">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td align="center"
                                    style="background-color:#E7FAF8; width:30px; height:30px; border-radius:5px;">
                                  <img src="https://i.ibb.co/yc2zKH52/call.png"
                                       alt="phone icon"
                                       width="20"
                                       height="20"
                                       style="display:block; border:0;" />
                                </td>
                                <td style="padding-left:10px;">
                                  <span style="color:#DCF5F2; font-family:Arial, Helvetica, sans-serif; font-size:14px;">
                                    06 50 11 55 80
                                  </span>
                                </td>
                              </tr>
                            </table>
                          </td>

                          <td align="center" valign="middle" style="padding:10px;">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td align="center"
                                    style="background-color:#E7FAF8; width:30px; height:30px; border-radius:5px;">
                                  <img src="https://i.ibb.co/Csnk41fY/email.png"
                                       alt="mail icon"
                                       width="20"
                                       height="20"
                                       style="display:block; border:0;" />
                                </td>
                                <td style="padding-left:10px;">
                                  <a href="mailto:symphony@krialys.com"
                                     style="color:#DCF5F2; text-decoration:none; font-family:Arial, Helvetica, sans-serif; font-size:14px;">
                                    symphony@krialys.com
                                  </a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
          </table>


          <!-- ========================= -->
          <!-- ROW-6 (ORANGE #ff8426) -->
          <!-- ========================= -->
          <table width="100%" border="0" cellpadding="0" cellspacing="0"
                 bgcolor="#ff8426"
                 style="background-color:#ff8426;"
                 class="bg-orange">
            <tr>
              <td style="padding:0; margin:0;">

                <!--[if mso]>
                <v:rect xmlns:v="urn:schemas-microsoft-com:vml"
                        fill="true" stroke="false"
                        style="position:absolute; top:0; left:0; width:100%; height:100%;"
                        fillcolor="#ff8426">
                  <v:textbox inset="0,0,0,0">
                <![endif]-->

                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0"
                       style="background-color:#ff8426; mso-background-alt:#ff8426;">
                  <tr>
                    <td style="padding-top:15px; padding-bottom:5px; text-align:center; font-family:Arial, Helvetica, sans-serif; color:#000000;">
                      <div style="width:100%; height:10px; background-color:#ff8426;"></div>
                    </td>
                  </tr>
                </table>

                <!--[if mso]>
                  </v:textbox>
                </v:rect>
                <![endif]-->

              </td>
            </tr>
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


app.listen(PORT, () => {
  console.log(`✅ Serveur opérationnel sur http://localhost:${PORT}`);
});
