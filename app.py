from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    # LINE Messaging APIからのリクエストを受信
    data = request.json
    print(data)  # デバッグ用（コンソールに出力される）
    return "OK", 200

if __name__ == '__main__':
    app.run(port=5000)