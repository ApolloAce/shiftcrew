(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
    });

    console.log('Status:', res.status);
    const text = await res.text();
    try {
      console.log('Body:', JSON.parse(text));
    } catch (e) {
      console.log('Body:', text);
    }
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
