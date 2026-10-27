// Disposable local sinks. Never route them to real recipients or provider accounts.
import net from "node:net";
import http from "node:http";
const messages = [],
  deliveries = new Map();
let transportFailure = false,forecastInvalid=false;
net
  .createServer((socket) => {
    let buffer = "",
      dataMode = false,
      data = "";
    socket.write("220 imsop.test SMTP sink\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (dataMode) {
          if (line === ".") {
            messages.push({ text: data, receivedAt: new Date().toISOString() });
            data = "";
            dataMode = false;
            socket.write("250 queued in isolated sink\r\n");
          } else data += line + "\n";
          continue;
        }
        if (/^EHLO|^HELO/i.test(line)) socket.write("250 imsop.test\r\n");
        else if (/^DATA/i.test(line)) {
          dataMode = true;
          socket.write("354 end with .\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.end("221 bye\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
  })
  .listen(11027, "0.0.0.0");
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if(req.url==='/forecast/mode'){forecastInvalid=req.method==='POST';res.end('{}');return;}
    if(req.url==='/forecast'&&req.method==='POST'){
      let text='';for await(const chunk of req)text+=chunk;
      const input=JSON.parse(text),products=new Map(input.series.map(s=>[s.sku,s.unit])),today=new Date().toISOString().slice(0,10),predictions=[];
      for(const [sku,unit]of products)for(let n=1;n<=input.horizonDays;n++)predictions.push({sku,date:new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10),quantity:1,unit});
      res.end(JSON.stringify({contractVersion:1,requestId:input.requestId,provider:'isolated-forecast',modelVersion:'isolated-contract-double-v1',generatedAt:new Date().toISOString(),sourceSnapshotAt:forecastInvalid?'2000-01-01T00:00:00.000Z':input.datasetSnapshotAt,predictions,limitations:['Isolated transport double, not an actual prediction model.']}));return;
    }
    if (req.url === "/messages") {
      res.end(JSON.stringify(messages));
      return;
    }
    if (req.url === "/transport/fail") {
      transportFailure = req.method === "POST";
      res.end("{}");
      return;
    }
    if (req.url === "/deliveries") {
      res.end(JSON.stringify([...deliveries.values()]));
      return;
    }
    if (req.url === "/transport" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      if (transportFailure) {
        res.writeHead(503);
        res.end("{}");
        return;
      }
      const key = req.headers["idempotency-key"];
      deliveries.set(key, { id: key, body: JSON.parse(body) });
      res.end("{}");
      return;
    }
    res.writeHead(404);
    res.end("{}");
  })
  .listen(18027, "0.0.0.0");
console.log("Isolated SMTP/transport sinks listening on 11027/18027");
