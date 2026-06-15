const fs = require('fs');

async function getLongLivedTokens() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node get-long-lived-tokens.js <APP_ID> <APP_SECRET>");
    process.exit(1);
  }

  const [APP_ID, APP_SECRET] = args;
  
  // Read current short-lived tokens from .env.local
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  const userTokenMatch = envContent.match(/FB_USER_ACCESS_TOKEN=(.*)/);
  const pageTokenMatch = envContent.match(/FB_PAGE_ACCESS_TOKEN=(.*)/);
  const pageIdMatch = envContent.match(/NEXT_PUBLIC_FB_PAGE_ID=(.*)/);

  if (!userTokenMatch) {
    console.error("Could not find FB_USER_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  const shortLivedUserToken = userTokenMatch[1];
  const pageId = pageIdMatch ? pageIdMatch[1] : null;

  try {
    console.log("1. Exchanging Short-Lived User Token for Long-Lived User Token (60 days)...");
    const userRes = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortLivedUserToken}`);
    const userData = await userRes.json();
    
    if (userData.error) throw new Error(userData.error.message);
    
    const longLivedUserToken = userData.access_token;
    console.log("✅ Success! Got long-lived User Token.");

    let longLivedPageToken = null;
    
    if (pageId) {
      console.log("\n2. Getting permanent Page Access Token...");
      // A Page Access Token generated from a long-lived User Token is permanent!
      const pageRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${longLivedUserToken}`);
      const pageData = await pageRes.json();
      
      if (pageData.error) throw new Error(pageData.error.message);
      
      longLivedPageToken = pageData.access_token;
      console.log("✅ Success! Got permanent Page Token.");
    }

    console.log("\nUpdating .env.local...");
    let newEnvContent = envContent;
    newEnvContent = newEnvContent.replace(/FB_USER_ACCESS_TOKEN=.*/, `FB_USER_ACCESS_TOKEN=${longLivedUserToken}`);
    if (longLivedPageToken) {
      newEnvContent = newEnvContent.replace(/FB_PAGE_ACCESS_TOKEN=.*/, `FB_PAGE_ACCESS_TOKEN=${longLivedPageToken}`);
    }

    fs.writeFileSync('.env.local', newEnvContent);
    console.log("✅ .env.local updated successfully.");

    console.log("\nNow, to push these to Vercel, simply run:");
    console.log("npx vercel env pull");
    console.log("npx vercel deploy --prod");

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getLongLivedTokens();
