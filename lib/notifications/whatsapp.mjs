import {
  WHATSAPP_API_URL,
  WHATSAPP_API_KEY,
  WHATSAPP_API_NUMBER,
} from "../environment.mjs";
export async function sendWhatsappMessage(message, mediaUrl) {
  const url = WHATSAPP_API_URL;
  const raw = {
    number: WHATSAPP_API_NUMBER,
    options: { delay: 1200, presence: "composing", linkPreview: false },
    mediaMessage: {
      mediatype: "image",
      caption: message,
      media: mediaUrl,
    },
  };
  const requestOptions = {
    method: "POST",
    body: JSON.stringify(raw),
    headers: {
      "Content-Type": "application/json",
      ApiKey: WHATSAPP_API_KEY,
    },

    redirect: "follow",
  };

  try {
    const response = await fetch(url, requestOptions);
    if (!response.ok) {
      console.error(
        `[ERROR] Failed to send message to Whatsapp: ${response.statusText}`
      );
    } else {
      console.info(`[INFO] Message sent to Whatsapp channel: ${message}`);
    }
  } catch (error) {
    console.error(
      `[ERROR] Error sending message to Whatsapp: ${error.message}`
    );
  }
}
