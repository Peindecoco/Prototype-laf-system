const form = document.getElementById("adminForm");
const statusEl = document.getElementById("uploadStatus");

// Change this to your actual backend admin password
const ADMIN_PASSWORD = "feu2025admin";

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const adminSecret = document.getElementById("adminSecret").value;
  if (adminSecret !== ADMIN_PASSWORD) {
    statusEl.textContent = "❌ Incorrect admin secret!";
    statusEl.style.color = "red";
    return;
  }

  const formData = new FormData(form);

  // 🧠 Example of what will be sent to your backend:
  const data = Object.fromEntries(formData.entries());
  console.log("Data to upload:", data);

  // You’ll later replace this with your actual fetch("/api/items", { ... })
  statusEl.textContent = "✅ Item uploaded successfully (mock).";
  statusEl.style.color = "green";

  form.reset();
});
