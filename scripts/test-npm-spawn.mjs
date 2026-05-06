import { spawn } from "child_process";
import fs from "fs";
const npmCmd = "C:\\\\Program Files\\\\nodejs\\\\npm.cmd";
const outPath = "C:\\\\Users\\\\Alper\\\\AppData\\\\Local\\\\Temp\\\\npm-raw.json";
const out = fs.createWriteStream(outPath);
const args = ["list","-a","--include","prod","--include","optional","--omit","dev","--json","--long","--silent","--loglevel=error"];
const child = spawn(npmCmd, args, { cwd: "C:\\\\sefpos", shell: true });
child.stdout.pipe(out);
let err = "";
child.stderr.on("data", (c) => { err += c.toString(); });
child.on("close", (code) => {
  out.end(() => {
    const st = fs.statSync(outPath);
    console.log("exit", code, "size", st.size, "stderrLen", err.length);
    const raw = fs.readFileSync(outPath, "utf8");
    try { JSON.parse(raw); console.log("JSON ok"); }
    catch (e) { console.log("JSON fail", e.message, "head", JSON.stringify(raw.slice(0,60))); }
  });
});
