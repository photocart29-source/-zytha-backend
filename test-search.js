const axios = require('axios');

async function testSearch() {
  try {
    const res = await axios.get('http://localhost:5001/api/products?search=Bang&limit=10');
    console.log('Search Results:', res.data.data.length);
    console.log('Sample:', res.data.data[0]?.name);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testSearch();
