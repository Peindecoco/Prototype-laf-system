// FRONTEND MOCK (No database)
const gallery = document.getElementById('gallery');
const uploadStatus = document.getElementById('uploadStatus');
const status = document.getElementById('status');

if (gallery) {
  gallery.innerHTML = `
    <div><img src="https://via.placeholder.com/200" alt="Wallet"><p><strong>Black Wallet</strong><br>Found in Canteen</p></div>
    <div><img src="https://via.placeholder.com/200" alt="Umbrella"><p><strong>Green Umbrella</strong><br>Found near Gym</p></div>
  `;
}

if (document.getElementById('reportForm')) {
  document.getElementById('reportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = "Your report has been submitted! Waiting for admin approval.";
    e.target.reset();
  });
}

if (document.getElementById('adminForm')) {
  document.getElementById('adminForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const secret = e.target.adminSecret.value;
    if (secret !== "feuadmin123") {
      uploadStatus.textContent = "❌ Unauthorized: Incorrect admin secret.";
      return;
    }
    uploadStatus.textContent = "✅ Item uploaded successfully (mock version)";
    e.target.reset();
  });
}
