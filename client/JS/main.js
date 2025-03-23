// Check if user is authenticated
document.addEventListener('DOMContentLoaded', function() {
    // Check if there's an auth token
    const authToken = localStorage.getItem('authToken');
    const isLoginPage = window.location.pathname.includes('login.html');
    const isRegisterPage = window.location.pathname.includes('register.html');
    
    // If on main app page but not authenticated, redirect to login
    if (!authToken && !isLoginPage && !isRegisterPage) {
        window.location.href = 'login.html';
        return;
    }
    
    // If on login/register page but already authenticated, redirect to main app
    if (authToken && (isLoginPage || isRegisterPage)) {
        window.location.href = 'index.html';
        return;
    }
    
    // If authenticated, update UI with user info
    if (authToken) {
        fetchUserInfo(authToken);
    }
});

// Fetch user information
async function fetchUserInfo(token) {
    try {
        const response = await fetch('/api/auth/me', {
            method: 'GET',
            headers: {
                'x-auth-token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update UI with user information
            updateUserUI(data.user);
        } else {
            // If token is invalid, log out
            logOut();
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
    }
}

// Update UI with user information
function updateUserUI(user) {
    // Check if auth links container exists
    const authLinksContainer = document.querySelector('.auth-links');
    
    if (authLinksContainer) {
        // Clear existing links
        authLinksContainer.innerHTML = '';
        
        // Create user dropdown
        const userDropdown = document.createElement('div');
        userDropdown.className = 'user-dropdown';
        
        // Create dropdown toggle
        const dropdownToggle = document.createElement('div');
        dropdownToggle.className = 'dropdown-toggle';
        dropdownToggle.innerHTML = `<span>${user.username}</span> <i class="fas fa-chevron-down"></i>`;
        
        // Create dropdown menu
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.innerHTML = `
            <a href="#" class="dropdown-item">Profile</a>
            <a href="#" class="dropdown-item">Settings</a>
            <div class="dropdown-divider"></div>
            <a href="#" class="dropdown-item" id="logoutBtn">Logout</a>
        `;
        
        // Append elements
        userDropdown.appendChild(dropdownToggle);
        userDropdown.appendChild(dropdownMenu);
        authLinksContainer.appendChild(userDropdown);
        
        // Toggle dropdown on click
        dropdownToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            dropdownMenu.classList.remove('show');
        });
        
        // Add logout functionality
        document.getElementById('logoutBtn').addEventListener('click', function(e) {
            e.preventDefault();
            logOut();
        });
    }
}

// Log out function
function logOut() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
} 