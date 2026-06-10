exports.handler = async function handler(event) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      ok: true,
      function: 'ping',
      message: 'Netlify Functions are deployed and reachable.',
      method: event.httpMethod,
      time: new Date().toISOString()
    })
  };
};
