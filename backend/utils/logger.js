export const logHandoff = (message) => {
  console.log(`[Antigravity Agent Handoff] ${message}`);
};

export const logInfo = (message) => {
  console.log(`[INFO] ${message}`);
};

export const logError = (message, err) => {
  console.error(`[ERROR] ${message}`, err);
};
