import paramiko
import sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)

# Delete Andrew Reyes
cmd = """mysql -uroot -p'@Emorej02e' shiftcrew -e "DELETE FROM users WHERE id = 'c832c8ea-807f-4b46-a7a1-de03f74d607c' AND role = 'employee';" """
stdin, stdout, stderr = ssh.exec_command(cmd)
output = stdout.read().decode()
err = stderr.read().decode()
print("DELETED:", output)
if err and "Warning" not in err:
    print("ERR:", err)
else:
    print("Andrew Reyes deleted successfully.")

ssh.close()
