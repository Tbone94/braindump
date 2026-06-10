exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ok: true,
      function: "ping",
      message: "Netlify Functions are deployed."
    })
  };
};
