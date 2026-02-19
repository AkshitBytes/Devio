import axios from "axios"
export const runjudge0 = async(source_code, language_id, stdin = "")=>{
    const encodedCode = Buffer.from(source_code).toString("base64")
    const encodedInput = Buffer.from(stdin).toString("base64")

    const response = await axios.post(
        "https://ce.judge0.com/submissions?base64_encoded=true&wait=true",
        {
            source_code:encodedCode,
            language_id:language_id,
            stdin:encodedInput
        },
        {
            headers:{
                "Content-type":"application/json"
            }
        }
    )
    const result = response.data;
    return {
    stdout: result.stdout
      ? Buffer.from(result.stdout, "base64").toString("utf-8")
      : null,

    stderr: result.stderr
      ? Buffer.from(result.stderr, "base64").toString("utf-8")
      : null,

    compile_output: result.compile_output
      ? Buffer.from(result.compile_output, "base64").toString("utf-8")
      : null,

    time: result.time,
    memory: result.memory,
    status: result.status
  }
}