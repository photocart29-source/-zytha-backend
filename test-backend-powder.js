const axios = require('axios');

async function testBackend() {
  try {
    const url = 'http://localhost:5001/api/products?search=powder&limit=10&status=active';
    console.log('Fetching:', url);
    const res = await axios.get(url);
    console.log('Success:', res.data.success);
    console.log('Total Results:', res.data.data.length);
    if (res.data.data.length > 0) {
      console.log('First Item:', res.data.data[0].name);
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testBackend();
