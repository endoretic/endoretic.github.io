// Site notation, not Hymmnos grammar: [[borrowed term]], {{lost fragment}}.
export function hymmnosParts(text) {
  return text.split(/(\[\[[^\[\]{}]+\]\]|\{\{[^\[\]{}]+\}\})/g)
    .map((part, index) => ({
      kind: index % 2 ? (part.startsWith("[[") ? "borrow" : "lost") : "text",
      text: index % 2 ? part.slice(2, -2) : part,
    }))
    .filter((part) => part.text !== "");
}

export function hymmnosTranscription(text) {
  return hymmnosParts(text).map((part) => part.text).join("");
}

export function renderHymmnos(line, text) {
  line.replaceChildren(...hymmnosParts(text).map((part) => {
    if (part.kind === "text") return document.createTextNode(part.text);
    const span = document.createElement("span");
    span.className = `hy-${part.kind}`;
    span.textContent = part.text;
    span.lang = "en";
    if (part.kind === "lost") {
      span.style.width = `${Math.min(6, Math.max(2, part.text.length * 0.4))}em`;
    }
    return span;
  }));
}
