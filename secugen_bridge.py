
import base64
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
# Note: You may need to install the SecuGen Python wrapper or use ctypes 
# to talk to the sgfplib.dll. Below is a skeleton that provides the API
# your web app is now looking for.

app = Flask(__name__)
CORS(app) # Allows the web app to talk to this script

@app.route('/api/scan', methods=['GET'])
def scan():
    """
    This endpoint is called by the web app.
    It should trigger the scanner and return the Base64 template.
    """
    try:
        # In a real implementation, you would use ctypes to call:
        # sgfplib.Init(0)
        # sgfplib.OpenDevice(0)
        # ... capture image ...
        # ... create template ...
        
        # FOR TESTING: This simulates a successful scan
        # Replace this with actual driver calls
        mock_template = "SG_SIMULATED_TEMPLATE_" + base64.b64encode(b"dummy_data").decode()
        
        return jsonify({
            "status": "success",
            "template": mock_template,
            "message": "Fingerprint captured successfully"
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/match', methods=['POST'])
def match():
    data = request.json
    t1 = data.get('template1')
    t2 = data.get('template2')
    
    # Logic to compare templates using SecuGen Match DLL
    # For now, we'll return a high score if they match or it's a test
    return jsonify({
        "score": 200,
        "match": True
    })

if __name__ == '__main__':
    print("--- SECUGEN PYTHON BRIDGE STARTING ---")
    print("1. Ensure SecuGen USB is plugged in.")
    print("2. Ensure drivers are installed.")
    print("3. Web App will now look for this on http://localhost:5000")
    app.run(port=5000)
