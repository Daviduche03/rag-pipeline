import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function testGenerateText() {
  try {
    // Test 1: Basic text generation
    console.log('\nTest 1: Basic text generation');
    const response1 = await fetch(`${API_URL}/generate-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'What was Google\'s total revenue for Q3 2023?'
      })
    });
    
    const result1 = await response1.json();
    console.log('Response:', result1);

    // Test 2: Empty text
    console.log('\nTest 2: Empty text');
    const response2 = await fetch(`${API_URL}/generate-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'What is the year-over-year growth in advertising revenue for google?'
      })
    });
    
    const result2 = await response2.json();
    console.log('Response:', result2);

    // Test 3: Long text
    console.log('\nTest 3: Long text');
    const response3 = await fetch(`${API_URL}/generate-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'How did Google Cloud perform in Q3 2023?'
      })
    });
    
    const result3 = await response3.json();
    console.log('Response:', result3);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
console.log('Starting generate-text API tests...');
testGenerateText().then(() => {
  console.log('\nTests completed!');
});
