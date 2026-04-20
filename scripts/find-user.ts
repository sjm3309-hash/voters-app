import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await svc.from("profiles").select("id, nickname").ilike("nickname", "%만두왕%");
  console.log(JSON.stringify(data));
  if (error) console.error(error.message);
}
main();
