import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)

# Show build log tail
_, o, _ = ssh.exec_command("tail -30 /tmp/nextbuild.log", timeout=10)
print(o.read().decode(errors='replace'), flush=True)

# Check errors
_, o, _ = ssh.exec_command("grep -i error /tmp/nextbuild.log | tail -5", timeout=10)
errs = o.read().decode(errors='replace').strip()
if errs:
    print("ERRORS:", errs, flush=True)
else:
    print("No errors in log", flush=True)

ssh.close()
