document.addEventListener("DOMContentLoaded", () => {
  const loadUserBtn = document.getElementById("loadUser");
  const userDataDiv = document.getElementById("userData");

  loadUserBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/user");
      const data = await res.json();
      userDataDiv.innerHTML = `
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Age:</strong> ${data.age}</p>
        <p><strong>Role:</strong> ${data.role}</p>
      `;
    } catch (err) {
      userDataDiv.textContent = "Error loading user data.";
      console.error(err);
    }
  });
});
