const API_URL = "http://localhost:4000";

export async function addExpense(data) {
    const res = await fetch(`${API_URL}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function getExpenses() {
    const res = await fetch(`${API_URL}/expenses`);
    return res.json();
}

export async function getSummary() {
    const res = await fetch(`${API_URL}/summary`);
    return res.json();
}
