// Show loading then login screen
window.onload = function() {
  setTimeout(() => {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('login').classList.remove('hidden');
  }, 2000);
};

// Fake login
function loginUser() {
  let user = document.getElementById("username").value;
  let pass = document.getElementById("password").value;
  
  if(user === "admin" && pass === "1234") {
    window.location.href = "app.html"; 
    return false;
  } else {
    alert("Invalid credentials! Try admin / 1234");
    return false;
  }
}

function logoutUser() {
  window.location.href = "index.html";
}
