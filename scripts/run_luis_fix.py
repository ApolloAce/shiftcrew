"""Upload fix_luis_server.py to the server and execute it there"""
import paramiko

HOST = '104.248.217.57'
USER = 'root'
PASS = '@Emorej02e'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Upload the script
sftp = ssh.open_sftp()
sftp.put('scripts/fix_luis_server.py', '/tmp/fix_luis_server.py')
sftp.close()
print("Uploaded script to server")

# Run it
stdin, stdout, stderr = ssh.exec_command('python3 /tmp/fix_luis_server.py')
out = stdout.read().decode()
err = stderr.read().decode()
print("=== STDOUT ===")
print(out)
if err:
    print("=== STDERR ===")
    print(err)

ssh.close()
