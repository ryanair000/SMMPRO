const fs = require('fs');

async function testGenerate() {
  try {
    const base64Data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    
    console.log("Sending request to http://localhost:3000/api/generate...");
    
    const res = await fetch('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Data })
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response Text:", text);
    
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testGenerate();
