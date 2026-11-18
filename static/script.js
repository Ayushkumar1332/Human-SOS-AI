
/* ==========================================
   HumanSOS AI - MAIN JAVASCRIPT
   Emergency Safety Application
========================================== */

document.addEventListener("DOMContentLoaded", function () {

    // ======================================
    // 1. GLOBAL ELEMENTS
    // ======================================

    const locationBtn = document.getElementById("locationBtn");
    const locationResult = document.getElementById("locationResult");

    const emergencyLocationBtn = document.getElementById("getEmergencyLocation");
    const emergencyLocation = document.getElementById("emergencyLocation");

    let currentLocation = null;
    let selectedEmergency = "Other";
    let sosTimer = null;
    let sosCountdown = 5;
    let sosCancelled = false;


    // ======================================
    // 2. GET USER LOCATION
    // ======================================

    function getUserLocation(outputElement, callback) {

        if (!navigator.geolocation) {
            outputElement.textContent =
                "Your browser does not support GPS location.";
            return;
        }

        outputElement.textContent = "Fetching your location...";

        navigator.geolocation.getCurrentPosition(

            function (position) {

                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                currentLocation = {
                    latitude: latitude,
                    longitude: longitude
                };

                outputElement.innerHTML = `
                    <strong>Location Found!</strong><br>
                    Latitude: ${latitude.toFixed(6)}<br>
                    Longitude: ${longitude.toFixed(6)}<br><br>
                    <a href="https://www.google.com/maps?q=${latitude},${longitude}"
                       target="_blank" rel="noopener noreferrer">
                       View on Google Maps ↗
                    </a>
                `;

                if (callback) {
                    callback(currentLocation);
                }
            },

            function (error) {

                let message = "Unable to fetch location.";

                if (error.code === 1) {
                    message = "Location permission denied. Please allow location access.";
                } else if (error.code === 2) {
                    message = "Location information is unavailable.";
                } else if (error.code === 3) {
                    message = "Location request timed out.";
                }

                outputElement.textContent = message;
            },

            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }


    // Dashboard location button

    if (locationBtn && locationResult) {

        locationBtn.addEventListener("click", function () {

            getUserLocation(locationResult);

        });

    }


    // Emergency location button

    if (emergencyLocationBtn && emergencyLocation) {

        emergencyLocationBtn.addEventListener("click", function () {

            getUserLocation(emergencyLocation);

        });

    }


    // ======================================
    // 3. EMERGENCY CATEGORY SELECTION
    // ======================================

    const emergencyTypes = document.querySelectorAll(".emergency-type");

    emergencyTypes.forEach(function (button) {

        button.addEventListener("click", function () {

            emergencyTypes.forEach(function (item) {
                item.classList.remove("selected");
            });

            button.classList.add("selected");

            selectedEmergency = button.dataset.type || "Other";

        });

    });


    // ======================================
    // 4. SOS CONFIRMATION SYSTEM
    // ======================================

    const activateSOS = document.getElementById("activateSOS");
    const cancelSOS = document.getElementById("cancelSOS");
    const emergencyStatus = document.getElementById("emergencyStatus");

    function stopSOSCountdown() {

        if (sosTimer) {
            clearInterval(sosTimer);
            sosTimer = null;
        }

    }


    if (activateSOS && emergencyStatus) {

        activateSOS.addEventListener("click", function () {

            if (sosTimer) {
                return;
            }

            sosCancelled = false;
            sosCountdown = 5;

            activateSOS.disabled = true;
            activateSOS.textContent = "CONFIRMING...";

            emergencyStatus.textContent =
                "SOS confirmation in " + sosCountdown +
                " seconds. Press Cancel if this was accidental.";

            sosTimer = setInterval(function () {

                sosCountdown--;

                emergencyStatus.textContent =
                    "SOS confirmation in " + sosCountdown + " seconds.";

                if (sosCountdown <= 0) {

                    stopSOSCountdown();

                    if (!sosCancelled) {

                        emergencyStatus.textContent =
                            "SOS request prepared. Connecting to emergency system...";

                        submitEmergencyRequest();

                    }

                }

            }, 1000);

        });

    }


    // ======================================
    // 5. CANCEL SOS
    // ======================================

    if (cancelSOS) {

        cancelSOS.addEventListener("click", function () {

            if (sosTimer) {

                sosCancelled = true;

                stopSOSCountdown();

                activateSOS.disabled = false;
                activateSOS.textContent = "ACTIVATE SOS";

                emergencyStatus.textContent =
                    "SOS cancelled. No alert was sent.";

            }

        });

    }


    // ======================================
    // 6. SEND SOS TO FLASK BACKEND
    // ======================================

    async function submitEmergencyRequest() {

        if (!currentLocation) {

            emergencyStatus.textContent =
                "Location not available. Fetch location before activating SOS.";

            activateSOS.disabled = false;
            activateSOS.textContent = "ACTIVATE SOS";

            return;

        }

        const emergencyData = {

            emergency_type: selectedEmergency,

            latitude: currentLocation.latitude,

            longitude: currentLocation.longitude

        };

        try {

            const response = await fetch("/api/emergency", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(emergencyData)

            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Emergency request failed.");
            }

            emergencyStatus.textContent =
                result.message || "Emergency request received by server.";

            activateSOS.textContent = "SOS REQUESTED";

        }

        catch (error) {

            emergencyStatus.textContent =
                "SOS could not be confirmed: " + error.message;

            activateSOS.disabled = false;
            activateSOS.textContent = "ACTIVATE SOS";

        }

    }


    // ======================================
    // 7. AI CHAT ASSISTANT
    // ======================================

    const chatForm = document.getElementById("chatForm");
    const userMessage = document.getElementById("userMessage");
    const chatMessages = document.getElementById("chatMessages");
    const sendBtn = document.getElementById("sendBtn");


    function addMessage(message, sender) {

        const messageDiv = document.createElement("div");

        messageDiv.classList.add("message");

        if (sender === "user") {
            messageDiv.classList.add("user-message");
        } else {
            messageDiv.classList.add("ai-message");
        }

        const avatar = document.createElement("div");

        avatar.classList.add("message-avatar");

        avatar.textContent = sender === "user" ? "👤" : "🤖";

        const content = document.createElement("div");

        content.classList.add("message-content");

        // Safe text insertion
        content.textContent = message;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        chatMessages.appendChild(messageDiv);

        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageDiv;

    }


    async function sendToAI(message) {

        try {

            const response = await fetch("/api/chat", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    message: message
                })

            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "AI request failed.");
            }

            return result.reply || "I could not generate a response.";

        }

        catch (error) {

            throw error;

        }

    }


    if (chatForm && userMessage && chatMessages) {

        chatForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const message = userMessage.value.trim();

            if (!message) {
                return;
            }

            addMessage(message, "user");

            userMessage.value = "";

            sendBtn.disabled = true;

            const loadingMessage = addMessage(
                "HumanSOS AI is thinking...",
                "ai"
            );

            try {

                const reply = await sendToAI(message);

                loadingMessage.querySelector(".message-content").textContent =
                    reply;

            }

            catch (error) {

                loadingMessage.querySelector(".message-content").textContent =
                    "Unable to connect to AI. Please try again or contact emergency services if you are in immediate danger.";

            }

            finally {

                sendBtn.disabled = false;

                userMessage.focus();

            }

        });

    }


    // ======================================
    // 8. VOICE RECOGNITION
    // ======================================

    const voiceBtn = document.getElementById("voiceBtn");

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (voiceBtn) {

        if (SpeechRecognition) {

            const recognition = new SpeechRecognition();

            recognition.lang = "hi-IN";

            recognition.continuous = false;

            recognition.interimResults = false;

            voiceBtn.addEventListener("click", function () {

                try {

                    recognition.start();

                    voiceBtn.textContent = "🎙️ Listening...";

                }

                catch (error) {

                    console.log("Voice recognition already active.");

                }

            });


            recognition.onresult = function (event) {

                const transcript =
                    event.results[0][0].transcript;

                userMessage.value = transcript;

                userMessage.focus();

            };


            recognition.onend = function () {

                voiceBtn.textContent = "🎙️";

            };


            recognition.onerror = function () {

                voiceBtn.textContent = "🎙️";

                alert("Voice recognition failed. Please try again.");

            };

        }

        else {

            voiceBtn.disabled = true;

            voiceBtn.title = "Voice recognition is not supported in this browser.";

        }

    }


    // ======================================
    // 9. AI TEXT TO SPEECH
    // ======================================

    function speakMessage(message) {

        if (!("speechSynthesis" in window)) {
            return;
        }

        window.speechSynthesis.cancel();

        const speech = new SpeechSynthesisUtterance(message);

        speech.lang = "hi-IN";

        speech.rate = 1;

        speech.pitch = 1;

        window.speechSynthesis.speak(speech);

    }


    // Available for later AI voice response integration
    window.humanSOS = {
        speakMessage: speakMessage,
        getCurrentLocation: function () {
            return currentLocation;
        }
    };


    console.log("HumanSOS AI JavaScript Loaded Successfully!");

});
