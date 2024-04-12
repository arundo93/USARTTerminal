function RingBuffer(size){
    this.buffer = new Uint8Array(size);
    this.ptrBegin = 0;
    this.ptrEnd = 0;
    this.dataLen = 0;
    this.size = size;
    this.putToEnd = function(byte){
        if(this.dataLen >= this.size){
            return 0;
        }
        this.buffer[this.ptrEnd] = byte;
        this.ptrEnd++;
        this.dataLen++;
        if(this.ptrEnd >= this.size){
            this.ptrEnd = 0;
        }
        return 1;
    }
    this.getFromBegin = function(){
        if(!this.dataLen){
            return undefined;
        }
        const result = this.buffer[this.ptrBegin];
        this.ptrBegin++;
        this.dataLen--;
        if(this.ptrBegin >= this.size){
            this.ptrBegin = 0;
        }
        return result;
    }
    this.erase = function(){
        this.ptrBegin = 0;
        this.ptrEnd = 0;
        this.dataLen = 0;
    }
    return;
}


let oscilloscope = {
    ringBuffer: new RingBuffer(1024),
    index: 0,
    status: 0,
    lastChunkTime: 0,
    period: 0,
    sync: 0,
    line: undefined,
    verticalScan: undefined,
    horisontalScan: undefined,
    init: function(){
        window.addEventListener("load", () => {
            this.line = document.getElementById("signal").getAttribute("d");
            //console.log(this.line);
            this.drawOsc();
        });
    },
    putBytesToArray: function(chunk){
        const deltaTime = (new Date - this.lastChunkTime);
        if(Math.floor(deltaTime / 10) === Math.floor(this.period / 10) && !this.sync){
            this.ringBuffer.erase();
            this.index = 0;
            this.line = "M-1 150";
            this.sync = 1;
        }
        if(deltaTime < 10000 && deltaTime > this.period){
            this.period = deltaTime;
        }
        this.lastChunkTime = new Date();
        for(let byte of chunk){
            if(!this.ringBuffer.putToEnd(byte)){
                break;
            }
        }
        if(!this.status){
            this.drawOsc();
        }
    },
    drawOsc: function(){
        return new Promise((resolve, reject) => {
            if(this.ringBuffer.dataLen < 2){
                resolve(0);
            }
            let highByte = this.ringBuffer.getFromBegin();
            let lowByte = this.ringBuffer.getFromBegin();
            if(highByte & 0xF0){
                highByte = lowByte;
                lowByte = this.ringBuffer.getFromBegin();
            }
            if(this.index >= 160){
                this.index = 0;
                this.line = "M-1 150";
            }
            if(typeof lowByte != "undefined"){
                let point = parseInt((((highByte & 0xF) << 8) + lowByte - 2048) * 1089 / 4096);
                this.line += `L${this.index * 2} ${150 - point}`;
                this.index++;
                document.getElementById("signal").setAttribute("d", this.line);
            }
            if(this.ringBuffer.dataLen > 2){
                resolve(1);
            }
            resolve(0);
        }).then((status) => {
            this.status = status;
            if(status){
                return this.drawOsc();
            }
        })
    },
    clearOsc: function(){
        this.line = "M-1 150";
        document.getElementById("signal").setAttribute("d", this.line);
    }
}

let serialPortManager = {
    serialPort: undefined,
    reader: undefined,
    terminalText: undefined,
    deviceFilters: [
        { usbVendorId: 0x0403},
    ],
    portParams: {
        baudRate: 38400,
        bufferSize: 1024,
    },
    controlsIDs: {
        connect: "connectDevice",
        disconnect: "disconnectDevice",
        startReading: "readDataFromDevice",
        stopReading: "stopReadingData",
        startDrawing: "readChartFromDevice",
        stopDrawing: "stopReadingChart",
    },
    portStatus: {
        connected: false,
        reading: false,
        drawing: false,
    },
    checkNavigator: function(){
        try{
            if(!navigator.serial){
                console.log("No serial Port support in your browser!");
                this.showNotification("No serial Port support in your browser!")
                return false;
            }
        }
        catch(err){
            console.error(err);
            this.showNotification(err.message);
            return false;
        }
        return true;
    },
    init: function(){
        if(!this.checkNavigator()){
            return;
        }
        window.addEventListener("load", () => {
            document.querySelector(".terminal").addEventListener("click", (event) => {
                if(event.target.id){
                    this.terminalControls(event.target.id);
                }
            });
            this.terminalText = document.getElementById("terminalText");
            this.updateTerminalStatus({type: "device", value: "waiting"});
            this.updateTerminalStatus({type: "text", value: "stopped"});
            this.updateTerminalStatus({type: "chart", value: "stopped"});
        });
    },
    connectToPort: function(){
        if(!this.checkNavigator()){
            return;
        }
        navigator.serial.requestPort({filters: this.deviceFilters}).then((port) => {
            if(port){
                return port.open(this.portParams).then(()=>{
                    this.serialPort = port;
                    this.portStatus.connected = true;
                    this.showNotification("Connected!");
                    this.updateButton(this.controlsIDs.connect, this.controlsIDs.disconnect);
                    this.updateTerminalStatus({type: "device", value: "active"});
                });
            }
        }).catch((err) => {
            this.showNotification(err.message);
        })
    },
    updateButton: function(...buttonIDs){
        for(let id of buttonIDs){
            document.getElementById(id).classList.toggle("hidden");
        }
    },
    updateTerminalStatus: function(newStatus = {type, value}){
        switch(newStatus.type){
            case "device":
                document.getElementById("deviceStatus").style.backgroundColor = `var(--${newStatus.value})`;
                break;
            case "text":
                document.getElementById("readerStatus").style.backgroundColor = `var(--${newStatus.value})`;
                break;
            case "chart":
                document.getElementById("chartStatus").style.backgroundColor = `var(--${newStatus.value})`;
                break;
            default:
                break;
        }
    },
    readData: async function(){
        const reader = this.serialPort.readable.getReader();
        const decoder = new TextDecoder("utf-8");
        this.reader = reader;
        // Listen to data coming from the serial device.
        try{
            while(true){
                const { value, done } = await reader.read();
                if(done){
                    // Allow the serial port to be closed later.
                    reader.releaseLock();
                    break;
                }
                // value is a Uint8Array.
                //console.log(value);
                if(this.portStatus.reading){
                    this.updateTerminalText(decoder.decode(value));
                }
                if(this.portStatus.drawing){
                    oscilloscope.putBytesToArray(value);
                }
                // this.updateTerminalText(decoder.decode(value));
            }
        }
        catch(err){
            this.showNotification(err);
            console.error(err);
        }
    },
    updateTerminalText: function(text, reset = false){
        if(!this.terminalText){
            return;
        }
        if(this.terminalText.innerHTML.length > 5000){
            reset = true
        }
        if(reset){
            this.terminalText.innerHTML = text;
        }
        else{
            this.terminalText.innerHTML += text;
        }
    },
    terminalControls: function(id){
        switch(id){
            case this.controlsIDs.connect:
                if(this.reader){
                    this.reader.cancel();
                    this.reader = undefined;
                }
                if(this.portStatus.connected){
                    this.serialPort.close().then(() => {
                        this.portStatus.connected = false;
                        this.updateTerminalStatus({type: "device", value: "stopped"});
                    });
                }
                this.connectToPort();
                this.updateTerminalText("", true);
                break;
            case this.controlsIDs.disconnect:
                new Promise((resolve, reject) => {
                    if(this.reader){
                        this.reader.cancel().then(() => {
                            this.reader = undefined;
                            this.updateTerminalText("", true);
                            resolve();
                        }).catch((err) => {
                            resolve();
                        });
                    }
                    else{
                        resolve();
                    }
                }).then(() => {
                    return this.serialPort.close();
                }).then(() => {
                    if(this.portStatus.reading){
                        this.portStatus.reading = false;
                        this.updateTerminalStatus({type: "text", value: "stopped"});
                        this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading);
                    }
                    if(this.portStatus.drawing){
                        this.portStatus.drawing = false;
                        this.updateTerminalStatus({type: "chart", value: "stopped"});
                        this.updateButton(this.controlsIDs.startDrawing, this.controlsIDs.stopDrawing);
                    }
                    this.portStatus.connected = false;
                    this.showNotification("Disconnected!");
                    this.updateTerminalStatus({type: "device", value: "waiting"});
                    this.updateButton(this.controlsIDs.connect, this.controlsIDs.disconnect);
                    this.updateTerminalText("", true);
                    oscilloscope.clearOsc();
                });
                break;
            case this.controlsIDs.startReading:
                if(this.portStatus.reading || !this.portStatus.connected){
                    break;
                }
                this.portStatus.reading = true;
                this.updateTerminalStatus({type: "text", value: "active"});
                this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading);
                if(!this.reader){
                    this.readData();
                }
                break;
            case this.controlsIDs.stopReading:
                if(!this.portStatus.reading){
                    break;
                }
                this.portStatus.reading = false;
                if(this.reader && !this.portStatus.reading && !this.portStatus.drawing){
                    this.reader.cancel();
                    this.reader = undefined;
                }
                this.updateTerminalStatus({type: "text", value: "stopped"});
                this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading);
                break;
            case this.controlsIDs.startDrawing:
                if(this.portStatus.drawing || !this.portStatus.connected){
                    break;
                }
                this.portStatus.drawing = true;
                this.updateTerminalStatus({type: "chart", value: "active"});
                this.updateButton(this.controlsIDs.startDrawing, this.controlsIDs.stopDrawing);
                if(!this.reader){
                    this.readData();
                }
                break;
            case this.controlsIDs.stopDrawing:
                if(!this.portStatus.drawing){
                    break;
                }
                this.portStatus.drawing = false;
                if(this.reader && !this.portStatus.reading && !this.portStatus.drawing){
                    this.reader.cancel();
                    this.reader = undefined;
                }
                this.updateTerminalStatus({type: "chart", value: "stopped"});
                this.updateButton(this.controlsIDs.startDrawing, this.controlsIDs.stopDrawing);
                break;
            default:
                break;
        }
    },
    showNotification: function(text){
        document.querySelector(".tooltip").innerHTML = text;
        document.querySelector(".tooltip").classList.add("tooltip-enable");
        setTimeout(() => {
            document.querySelector(".tooltip").classList.remove("tooltip-enable");
        }, 4000);
    },
}

oscilloscope.init();
serialPortManager.init();

function connectToUSB(){
    navigator.usb.requestDevice({ filters: [] }).then(device => {
        console.log(device.productName);
        console.log(device.manufacturerName);
        return device.open();
    }).then(() => {
        return device.selectConfiguration(1)
    }).then(() => {
        return device.claimInterface(2)
    }).then(() => {
        return device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x22,
            value: 0x01,
            index: 0x02
        });
    }).then(() => {
        return device.transferIn(5, 64)
    }).then(result => {
        const decoder = new TextDecoder();
        console.log('Received: ' + decoder.decode(result.data));
    }).catch(error => {
        console.error(error);
    });
}