(function () {
  const script = document.currentScript;

  if (!script) {
    console.error("Margo: script not found.");
    return;
  }

  const chatbotId = script.getAttribute("data-chatbot-id");

  if (!chatbotId) {
    console.error("Margo: chatbot ID is required.");
    return;
  }

  console.log("Margo chatbot ID:", chatbotId);

  const iframe = document.createElement("iframe");

  iframe.src = `http://localhost:5173/embed/chatbot?chatbotId=${encodeURIComponent(
    chatbotId,
  )}`;

  iframe.title = "Margo Chatbot";

  Object.assign(iframe.style, {
    position: "fixed",
    bottom: "0",
    right: "0",
    width: "430px",
    height: "650px",
    border: "0",
    background: "transparent",
    zIndex: "999999",
  });

  document.body.appendChild(iframe);
})();
