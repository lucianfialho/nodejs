export async function sendWhatsappMessage(message, mediaUrl) {
  const url = `https://evolution-api.criativeflow.com.br/message/sendMedia/cel_lucian`;
  const raw = {
    number: "120363328382924911@g.us",
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
      ApiKey: "1v3gm5zgzz81g3pmkeva2mi",
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
