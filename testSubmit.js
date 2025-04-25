const axios = require("axios");

const testData = {
  "Informations Utilisateur": [
    { "label": "Nom", "value": "Ray" },
    { "label": "Prénom", "value": "gsgsg" },
    { "label": "E-mail", "value": "gdgs" }
  ],
  "Accès & Autonomie": [
    {
      "question": "Des compétences sur les outils d’analyse ou de visualisation de données existent-elles en interne ?",
      "note": "3"
    },
    {
      "question": "Des outils de visualisation ou d’analyse sont-ils intégrés au projet ?",
      "note": "4"
    }
  ]
};

axios
  .post("http://localhost:3000/submit", testData)
  .then((res) => {
    console.log("✅ Succès :", res.data);
  })
  .catch ((err) => {
    console.error("❌ Erreur :", err?.message || err);
    console.error(err?.stack || "Pas de stack trace disponible");
  });
