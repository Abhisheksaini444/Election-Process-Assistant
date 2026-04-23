# India Civic Assistant 🗳️

An intelligent, highly interactive web application designed to guide Indian citizens through the complete election lifecycle. The assistant provides state-aware, personalized, and step-by-step educational guidance regarding voter registration, eligibility, document requirements, and the voting process.

## 🌟 Key Features

*   **State-Aware Personalization**: Automatically extracts your state (e.g., Gujarat, Maharashtra) from natural language queries and remembers it to tailor subsequent advice (e.g., specific CEO website links, state-specific registration camps).
*   **Context Retention Engine**: Intelligently tracks whether you are trying to *register* or *vote*, and whether you are a *first-time voter*, providing highly customized responses without asking the same question twice.
*   **Strict Political Neutrality**: Built with robust safeguards that instantly deflect questions about specific candidates or political parties. The bot focuses purely on *how* to vote, not *who* to vote for.
*   **Proactive Misconception Correction**: Automatically detects and politely corrects common misunderstandings (e.g., believing you can vote online, or thinking registration happens automatically at age 18).
*   **Step-by-Step Guidance**: Breaks down complex official procedures (like Form 6 for registration or Form 8 for updates/lost IDs) into clear, actionable steps referencing official ECI/NVSP portals.
*   **Smart Follow-Ups**: Suggests proactive next steps, such as generating a Voting Day Checklist, tracking application statuses, or finding polling booths.

## 🛠️ Technology Stack

*   **Frontend**: HTML5 & Modern CSS (Flexbox, CSS Variables, Glassmorphism design elements).
*   **Logic**: Vanilla JavaScript implementing a custom state-machine and natural language intent parser.
*   *No external heavy frameworks (React/Vue/Angular) used—pure, performant web technologies.*

## 🚀 How to Run Locally

1.  Clone the repository:
    ```bash
    git clone https://github.com/Abhisheksaini444/Election-Process-Assistant.git
    ```
2.  Navigate to the directory:
    ```bash
    cd Election-Process-Assistant
    ```
3.  Open `index.html` in any modern web browser or serve it using a local server (e.g., `npx serve` or Live Server in VSCode).

## 🛡️ Disclaimer

This assistant is purely for educational and informational purposes. It is strictly non-partisan and apolitical. Always refer to the official [Election Commission of India (ECI)](https://eci.gov.in/) or [National Voter's Service Portal (NVSP)](https://voters.eci.gov.in/) for final, authoritative information.