import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

try:
    stdin, stdout, stderr = ssh.exec_command("pgrep -af 'next build' || echo NOT_RUNNING", timeout=20)
    print("=== BUILD PROCESSES ===")
    print(stdout.read().decode(errors="replace").strip())

    stdin, stdout, stderr = ssh.exec_command("tail -60 /tmp/nextbuild.log", timeout=20)
    print("\n=== BUILD LOG TAIL ===")
    print(stdout.read().decode(errors="replace").strip())

    stdin, stdout, stderr = ssh.exec_command("stat -c '%y %s bytes' /tmp/nextbuild.log || true", timeout=20)
    print("\n=== BUILD LOG MTIME ===")
    print(stdout.read().decode(errors="replace").strip())
finally:
    ssh.close()
