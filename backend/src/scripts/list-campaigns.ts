import 'dotenv/config';
import { db } from '../config/supabase';

async function main() {
  const { data, error } = await db
    .from('campaigns')
    .select('id, title_ja, is_active, end_date');
  if (error) { console.error(error.message); return; }
  console.log(JSON.stringify(data, null, 2));
}

main();
