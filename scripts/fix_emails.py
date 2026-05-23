import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", 22, "root", "@Emorej02e")

cmd = """cd /var/www/shiftcrew && node -e '
const mysql = require("mysql2/promise");
async function run() {
  const p = await mysql.createPool({host:"127.0.0.1",user:"shiftcrew_user",password:"shiftcrew_client",database:"shiftcrew"});
  await p.query("UPDATE users SET email = ? WHERE id = ?", ["jericogarcia@shiftcrew.com", "a681bbad-6a28-46cd-97a4-9e6a838a0886"]);
  console.log("Updated jerico@shiftmate.com -> jericogarcia@shiftcrew.com");
  const [remaining] = await p.query("SELECT id, email FROM users WHERE email LIKE ?", ["%@shiftmate.com"]);
  console.log("Remaining shiftmate emails:", remaining.length);
  await p.end();
}
run().catch(e => { console.error(e); process.exit(1); });
'"""

_, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
