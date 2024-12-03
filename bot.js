const { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin, RichReply } = require("matrix-bot-sdk");
const express = require("express");
const bodyParser = require("body-parser");
require('dotenv').config();

// Configuración
const homeserverUrl = process.env.HOMESERVER_URL || "https://chat.grupolabe.com"; // URL de tu servidor Matrix
const accessToken = process.env.ACCESS_TOKEN || "syt_bGVhZHM_XfapJbcqBxSzaSMPvTsz_3c40US"; // Token de acceso del bot

// Mapeo de sectores a roomIds
const sectorRooms = {
    "Fiscal": "!BZGxZMPwLxUiXMBOtx:chat.grupolabe.com",
    "Penal": "!yUOEFRumXhdtgwjOMj:chat.grupolabe.com",
    "Mercantil": "!JlfdsrmcDqoczpDKws:chat.grupolabe.com",
    "Laboral": "!CbILnwmvjQOcTuyxfZ:chat.grupolabe.com",
    "Extranjería": "!cFyEJSAKpfhINRUhBE:chat.grupolabe.com",
    "Civil": "!imTVtfEQcbIJBuublM:chat.grupolabe.com",
    "Otra": "!euZFfwZDrbEaCVUyXZ:chat.grupolabe.com"
};

const client = new MatrixClient(homeserverUrl, accessToken);

// Auto-join a las salas designadas
AutojoinRoomsMixin.setupOnClient(client);

// Configurar Express para manejar webhooks
const app = express();
app.use(bodyParser.json());

// Endpoint para recibir datos de n8n
app.post("/webhook", async (req, res) => {
    const leadData = req.body;

    // Validar que 'Sector de consulta' esté presente
    if (!leadData['Sector de consulta']) {
        console.error("Falta el campo 'Sector de consulta' en el payload.");
        return res.status(400).send("Falta el campo 'Sector de consulta'.");
    }

    // Determinar la categoría del lead
    const sectorConsulta = leadData['Sector de consulta'];

    // Obtener el roomId correspondiente al sector
    const roomId = sectorRooms[sectorConsulta] || sectorRooms["Otra"]; // Default a "Otra" si no coincide

    if (!roomId) {
        console.error(`Sector de consulta desconocido: ${sectorConsulta}`);
        return res.status(400).send("Sector de consulta desconocido.");
    }

    // Publicar el lead en el canal específico
    const message = {
        msgtype: "m.text",
        body: `Nuevo Lead: **${leadData.nombre}**\n**Detalles**: ${leadData.detalles}`,
        format: "org.matrix.custom.html",
        formatted_body: `<b>Nuevo Lead:</b> <b>${leadData.nombre}</b><br><b>Detalles</b>: ${leadData.detalles}<br>
        <button onclick="window.location.href='matrix://action/accept?leadId=${leadData.id}'">Aceptar Lead</button>
        <button onclick="window.location.href='matrix://action/add_note?leadId=${leadData.id}'">Añadir Nota</button>
        <button onclick="window.location.href='matrix://action/close?leadId=${leadData.id}'">Cerrar Lead</button>`,
    };

    try {
        await client.sendMessage(roomId, message);
        res.sendStatus(200);
    } catch (error) {
        console.error("Error al enviar el mensaje a Matrix:", error);
        res.status(500).send("Error al procesar el lead.");
    }
});

// Manejar eventos de mensajes
client.on("room.message", async (roomId, event) => {
    if (event.sender === client.getUserId()) return; // Ignorar mensajes del propio bot

    const content = event.content;
    if (content && content.msgtype === "m.text") {
        const body = content.body.trim().toLowerCase();

        // Extraer el ID del lead de alguna manera, por ejemplo, mediante un formato específico
        const leadId = extractLeadId(body); // Implementa esta función según tu lógica

        if (body.includes("aceptar lead")) {
            // Actualizar el estado del lead a "Asignado"
            assignLead(leadId, event.sender);
            await client.sendMessage(roomId, {
                msgtype: "m.notice",
                body: `Lead ${leadId} ha sido aceptado y asignado a ti.`,
            });
        } else if (body.includes("añadir nota")) {
            // Manejar la adición de notas
            // Podrías abrir un diálogo privado o pedir la nota en el chat
        } else if (body.includes("cerrar lead")) {
            // Actualizar el estado del lead a "Cerrado"
            closeLead(leadId);
            await client.sendMessage(roomId, {
                msgtype: "m.notice",
                body: `Lead ${leadId} ha sido cerrado.`,
            });
        }
    }
});

// Iniciar el cliente de Matrix
client.start().then(() => {
    console.log("Bot iniciado");
});

// Iniciar el servidor Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Gestión de Leads (en memoria para pruebas)
const leads = {};

function assignLead(leadId, lawyerId) {
    if (leads[leadId]) {
        leads[leadId].assignedTo = lawyerId;
        leads[leadId].status = "Asignado";
    }
}

function addNoteToLead(leadId, note) {
    if (leads[leadId]) {
        if (!leads[leadId].notes) leads[leadId].notes = [];
        leads[leadId].notes.push(note);
    }
}

function closeLead(leadId) {
    if (leads[leadId]) {
        leads[leadId].status = "Cerrado";
    }
}

function extractLeadId(message) {
    // Implementa la lógica para extraer el ID del lead del mensaje
    // Por ejemplo, usando una expresión regular
    const regex = /Lead\s+(\d+)/i;
    const match = message.match(regex);
    return match ? match[1] : null;
}
