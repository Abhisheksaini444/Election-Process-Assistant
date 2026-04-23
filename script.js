document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const quickRepliesContainer = document.getElementById('quick-replies');
    const resetBtn = document.getElementById('reset-btn');

    let userState = {
        step: 0,
        stateName: null
    };

    // Initialize chat
    function initChat() {
        chatContainer.innerHTML = '';
        userState = { step: 0, stateName: null };
        
        const initialMessage = `Here’s a quick overview of how elections work in India:

1. **Voter Registration** (via NVSP or BLO)
2. **Candidate Nomination**
3. **Campaigning**
4. **Voting** (EVM/VVPAT)
5. **Counting & Results**

**What would you like to explore?**
1. How to register as a voter
2. How voting works step-by-step
3. Important election dates
4. Eligibility criteria
5. Documents required

**Which state are you from?** I’ll guide you based on your local election process.`;

        addBotMessage(initialMessage);
        setQuickReplies(["Maharashtra", "Delhi", "Karnataka", "Uttar Pradesh", "Other"]);
    }

    // Send message on button click
    sendBtn.addEventListener('click', handleSend);

    // Send message on Enter key
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    });

    // Reset conversation
    resetBtn.addEventListener('click', initChat);

    function handleSend() {
        const text = userInput.value.trim();
        if (text) {
            addUserMessage(text);
            userInput.value = '';
            processUserInput(text);
        }
    }

    function addUserMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message user';
        msgDiv.innerHTML = `
            <div class="avatar">👤</div>
            <div class="message-content">${formatText(text)}</div>
        `;
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
        clearQuickReplies();
    }

    function addBotMessage(text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        msgDiv.innerHTML = `
            <div class="avatar">🗳️</div>
            <div class="message-content">${formatText(text)}</div>
        `;
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot typing';
        msgDiv.id = 'typing-indicator';
        msgDiv.innerHTML = `
            <div class="avatar">🗳️</div>
            <div class="typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function setQuickReplies(replies) {
        quickRepliesContainer.innerHTML = '';
        replies.forEach(reply => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = reply;
            btn.addEventListener('click', () => {
                addUserMessage(reply);
                processUserInput(reply);
            });
            quickRepliesContainer.appendChild(btn);
        });
    }

    function clearQuickReplies() {
        quickRepliesContainer.innerHTML = '';
    }

    // Simple markdown-like formatting
    function formatText(text) {
        // Handle bold
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Handle newlines
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    function checkMisconceptions(query) {
        let correction = "";
        
        if (query.match(/\b(16|17|sixteen|seventeen)\b/) && (query.includes('vote') || query.includes('can i'))) {
            correction += "*Actually, a quick fact-check: The voting age in India is strictly 18 years, though 17-year-olds can now apply in advance to get registered once they turn 18.*\n\n";
        }
        
        if (query.includes('online') && query.includes('vote')) {
            correction += "*Just to clarify: While you can **register** online via NVSP, you cannot **vote** online in India. Voting is done in-person using EVMs (Electronic Voting Machines).*\n\n";
        }
        
        if ((query.includes('auto') || query.includes('already')) && query.includes('register')) {
            correction += "*A common misconception: You are **not** automatically registered to vote in India when you turn 18. You must proactively fill out Form 6 to register.*\n\n";
        }

        if (query.includes('pay') || query.includes('cost') || query.includes('fee')) {
            correction += "*Important note: Voter registration and voting are absolutely **free** in India.*\n\n";
        }

        return correction;
    }

    function setMenuReplies() {
        setQuickReplies([
            "1. How to register",
            "2. How voting works",
            "3. Important dates",
            "4. Eligibility criteria",
            "5. Documents required"
        ]);
    }

    // Logic for bot responses based on user input
    function processUserInput(input) {
        showTypingIndicator();
        
        setTimeout(() => {
            removeTypingIndicator();
            const lowerInput = input.toLowerCase();

            // Store original step to know if we just started
            const originalStep = userState.step;
            let newStateDetected = false;

            // Try to extract state if not already set, or if they mention a new one
            const indianStates = ["andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi"];
            for (const state of indianStates) {
                if (lowerInput.includes(state)) {
                    // Capitalize first letter of each word for display
                    userState.stateName = state.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    userState.step = 1; // Mark that we have a state
                    newStateDetected = true;
                    break;
                }
            }

            // Extract election type
            if (lowerInput.includes("lok sabha") || lowerInput.includes("national") || lowerInput.includes("general")) {
                userState.electionType = "Lok Sabha";
            } else if (lowerInput.includes("assembly") || lowerInput.includes("vidhan sabha") || lowerInput.includes("state")) {
                userState.electionType = "Assembly (Vidhan Sabha)";
            } else if (lowerInput.includes("municipal") || lowerInput.includes("panchayat") || lowerInput.includes("local")) {
                userState.electionType = "Local/Municipal";
            }

            // Extract first-time voter status
            if (lowerInput.includes("first time") || lowerInput.includes("never voted") || lowerInput.includes("new voter")) {
                userState.firstTime = true;
            }

            // Extract intent: registering vs voting
            if (lowerInput.includes("register") || lowerInput.includes("enroll") || lowerInput.includes("form 6")) {
                userState.currentAction = 'registering';
            } else if (lowerInput.includes("vote") || lowerInput.includes("voting") || lowerInput.includes("polling")) {
                userState.currentAction = 'voting';
            }

            // If we are at step 0 and they just provided a state (either parsed or fallback)
            if (originalStep === 0) {
                 if (!newStateDetected && input.trim().length < 20) {
                     // Assume whatever they typed is the state if it's short and we couldn't parse it
                     userState.stateName = input.trim();
                     userState.step = 1;
                 }
                 
                 // If the input was essentially just the state name, acknowledge and show menu
                 if (input.trim().split(' ').length <= 3) {
                     addBotMessage(`Noted! I will keep **${userState.stateName}** in mind for local specifics.\n\nNow, please select what you would like to explore from the menu below:`);
                     setMenuReplies();
                     return;
                 }
                 // Otherwise, if they asked a full question like "When is voting in Gujarat?", fall through to handle it
            } else if (!userState.stateName) {
                addBotMessage(`Before we dive into that, could you tell me **which state you are from**? Election processes can vary slightly.`);
                setQuickReplies(["Maharashtra", "Delhi", "Karnataka", "Uttar Pradesh", "Other"]);
                return;
            }

            handleGeneralQuery(lowerInput);
            
        }, 800);
    }

    function handleGeneralQuery(query) {
        let response = checkMisconceptions(query);
        let handled = true;

        // Customization prefixes
        let personalization = "";
        if (userState.firstTime && (query.includes('1') || query.includes('2') || query.includes('register') || query.includes('voting works'))) {
            personalization += "*Since you're a first-time voter, I'll make sure this is extra clear!*\n\n";
        }
        
        let stateContext = userState.stateName && userState.stateName.toLowerCase() !== "other" ? ` in **${userState.stateName}**` : "";
        let electionContext = userState.electionType ? ` for the upcoming **${userState.electionType}** elections` : "";

        // Enforce political neutrality
        const politicalKeywords = ["candidate", "party", "bjp", "congress", "aap", "vote for", "who should i", "opinion"];
        if (politicalKeywords.some(keyword => query.includes(keyword))) {
            addBotMessage("I am an unbiased civic assistant. I only explain the election process and do not discuss specific candidates, political parties, or offer voting advice. My goal is to help you understand *how* to vote, not *who* to vote for.");
            setTimeout(setMenuReplies, 100);
            return;
        }

        if (query.includes('1') || query.includes('register') || query.includes('status') || query.includes('update')) {
            response += personalization + `**Official Voter Services${stateContext}:**\n\nThe Election Commission of India (ECI) provides a central portal for all voter services: <a href="https://voters.eci.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">voters.eci.gov.in</a> (NVSP).\n\n**Exact steps for India:**\n- **Step 1:** Go to NVSP (voters.eci.gov.in)\n- **Step 2:** Fill Form 6\n- **Step 3:** Upload documents\n- **Step 4:** Verification by BLO\n- **Step 5:** Receive EPIC (Voter ID)\n\n**2. Check Voter ID Status:**\n- You can track your application status on the same portal using your Reference ID.\n- You can also search your name in the Electoral Roll online.\n\n**3. Update Details (Form 8):**\n- If you need to shift your residence, correct entries (name, DOB), or replace your EPIC, use **Form 8** on the portal.\n\n*For general information, visit the official ECI website: <a href="https://eci.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">eci.gov.in</a>.*`;
            
            // State-specific nuances for registration
            if (userState.stateName === "Maharashtra") {
                response += `\n\n*(State Tip: In Maharashtra, you can find dedicated voter registration camps during local festivals. Check <a href="https://ceo.maharashtra.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">ceo.maharashtra.gov.in</a>).*`;
            } else if (userState.stateName === "Delhi") {
                response += `\n\n*(State Tip: Delhi often has special mobile vans and camps in colleges for easy registration. Check <a href="https://ceodelhi.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">ceodelhi.gov.in</a>).*`;
            }

            response += `\n\n**What do you want next?**`;
            addBotMessage(response);
            setTimeout(() => {
                setQuickReplies(["1. Documents required", "2. Track application", "3. Voting process"]);
            }, 100);
            return; // Exit early to use custom quick replies
        } 
        else if (query.includes('track application') || (query.includes('2') && query.includes('track'))) {
            response += `**How to Track Your Application:**\n\nOnce you submit Form 6 on <a href="https://voters.eci.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">voters.eci.gov.in</a>, you receive a **Reference ID**.\nUse this ID on the "Track Application Status" page on the same portal to see if your application is accepted, rejected, or pending verification.`;
        }
        else if (query.includes('2') || query.includes('voting process') || query.includes('voting works') || query.includes('step-by-step')) {
             response += personalization + `**How Voting Works Step-by-Step${electionContext}:**\n\n1. Check your name on the voter list online before Election Day.\n2. Go to your designated polling booth${stateContext} with your Voter ID (EPIC) or a valid ID.\n3. Polling officials will verify your identity and mark your finger with indelible ink.\n4. Proceed to the voting compartment.\n5. Press the button next to your chosen candidate on the **EVM** (Electronic Voting Machine).\n6. Verify your vote via the **VVPAT** slip that appears in the window for 7 seconds.`;
        }
        else if (query.includes('3') || query.includes('when is voting') || query.includes('election date') || query.includes('date') || query.includes('timeline')) {
             response += `I don't have real-time election dates yet, but I can explain how to check them on official platforms like NVSP.\n\n`;
             response += `**How to check election dates${stateContext}:**\n\n`;
             if (userState.electionType === "Lok Sabha") {
                 response += `For National (Lok Sabha) elections, the dates are announced simultaneously for the whole country by the ECI.\n\n`;
             } else if (userState.electionType === "Local/Municipal") {
                 response += `For Local/Municipal elections, the dates are decided by the State Election Commission of ${userState.stateName}, not the national ECI.\n\n`;
             } else {
                 response += `Dates vary between Lok Sabha (national) and Vidhan Sabha (state) elections.\n\n`;
             }
             response += `*Always check the official Chief Electoral Officer (CEO) website for ${userState.stateName} or the <a href="https://voters.eci.gov.in/" target="_blank" style="color: var(--primary); text-decoration: underline;">NVSP portal</a> for the latest official notifications!*`;
        }
        else if (query.includes('4') || query.includes('eligibility')) {
             response += `**Eligibility Criteria:**\n\nTo vote in India, you must meet the following strictly:\n- **Be an Indian citizen.**\n- **Be at least 18 years old** on the qualifying date (usually January 1st).\n- Ordinarily resident of the polling area${stateContext}.\n- **One Voter ID per person:** It is illegal to be registered to vote in more than one place.\n- Not disqualified due to specific legal/mental reasons.`;
        }
        else if (query.includes('5') || query.includes('document')) {
             response += `**Documents Required:**\n\nTo vote${electionContext}, your primary document is the **EPIC (Voter ID)**. If you don't have it, you can use other ECI-approved IDs like:\n- Aadhaar Card\n- PAN Card\n- Driving License\n- Passport\n- MNREGA Job Card\n\nTo *register*, you need age proof (e.g., 10th marksheet, Aadhaar) and address proof (e.g., electricity bill, Aadhaar).`;
        }
        else if (query.includes('checklist')) {
            response += `**Voting Day Checklist:**\n\n✅ **Voter ID (EPIC)** or another approved ID.\n✅ **Voter Information Slip** (helpful for finding your booth/serial number quickly).\n✅ **Water Bottle & Umbrella** (for comfort while in line).\n✅ **Phone** (Remember: Phones are usually **not** allowed inside the voting booth, so you may need to leave it with someone or switch it off).\n\n*Pro-tip: Check your name on the voter list one last time the night before!*`;
        }
        else if (query.includes('reminders') || query.includes('deadlines')) {
            response += `**Registration Deadlines:**\n\nThe most important rule for registration deadlines in India is that **you must register before the last date of candidate nomination** for your specific constituency.\n\nOnce the candidates are finalized, the Electoral Roll is locked, and no new names can be added until after the election.\n\n*If you miss this deadline, you will not be able to vote in the upcoming election, even if you turn 18 on time!*`;
        }
        else if (query.includes('polling booth') || query.includes('finding')) {
            response += `**Finding Your Polling Booth:**\n\nYou can easily find the exact location of your polling booth through the ECI:\n\n1. Visit the **Voter Portal** (voters.eci.gov.in) and use the "Search in Electoral Roll" feature.\n2. Download the **Voter Helpline App** and search using your EPIC number.\n3. Send an SMS to 1950: Type **ECIPS <Space> <Your EPIC Number>** to get your booth details.\n\n*Make sure to check this a few days before the election, as booth locations can sometimes change!*`;
        }
        else if (query.includes('lost') || query.includes('replace')) {
            response += `**How to Replace a Lost Voter ID:**\n\nIf you have lost your EPIC (Voter ID), don't worry! You can apply for a replacement:\n\n1. Go to the **NVSP Portal** (voters.eci.gov.in).\n2. Select **Form 8** (Application for Correction/Shifting/Replacement).\n3. Choose the option for **"Issue of Replacement EPIC without correction"**.\n4. Select the reason (e.g., Lost) and upload a copy of the FIR/Police Complaint if required.\n5. Submit the form to receive a new EPIC by post.\n\n*Note: You can still vote if your name is on the Electoral Roll by showing an alternative ID like Aadhaar or PAN Card.*`;
        }
        else {
            handled = false;
            if (response === "") {
                response = `I'm not quite sure how to answer that yet.\nPlease select one of the options below to learn more about the process${stateContext}:`;
            } else {
                response += `Please select one from the menu below to continue learning:`;
            }
        }

        // Follow-up suggestions if a valid query was handled
        let useFollowUpMenu = false;
        if (handled && !query.includes('1') && !query.includes('register') && !query.includes('track application')) {
             response += `\n\n---\n**Important Reminders:**\n- **Deadlines:** Registration closes before the final candidate nomination day.\n- **Documents:** Always carry your EPIC (Voter ID) or an approved ID.\n- **Common Mistakes:** Verify your polling booth address beforehand and ensure your name is on the Electoral Roll (having a Voter ID alone isn't enough!).`;
             
             response += `\n\n**Would you like help with anything else?**`;
             useFollowUpMenu = true;
        }

        addBotMessage(response);
        setTimeout(() => {
            if (useFollowUpMenu) {
                setQuickReplies([
                    "Do you want a checklist for voting day?",
                    "Do you want reminders for registration deadlines?",
                    "Do you want help finding your polling booth?"
                ]);
            } else if (!query.includes('1') && !query.includes('register')) {
                // Default menu if it wasn't the register flow (which handles its own menu)
                setMenuReplies();
            }
        }, 100);
    }

    // Start the chat
    initChat();
});
