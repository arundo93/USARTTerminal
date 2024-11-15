function RingBuffer(size){
    this.buffer = new Uint8Array(size);
    this.ptrBegin = 0;
    this.ptrEnd = 0;
    this.dataLen = 0;
    this.size = size;
    //put element to buffer end
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
    //get element from buffer begin
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
    //clear buffer
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
            this.drawOsc();
        });
    },
    //put bytes from chunk to ringBuffer
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
            let p = Math.ceil(this.period / 100) *25;
            let f = 1000 / p + "Гц";
            if(p > 1000){
                p = (p / 1000 | 0) + "с";
            }
            else{
                p += "мс"
            }
            document.getElementById("oscPeriod").innerHTML = p;
            document.getElementById("oscFrequency").innerHTML = f;
        }
        this.lastChunkTime = new Date();
        for(let byte of chunk){
            if(!this.ringBuffer.putToEnd(byte)){
                console.log("Buffer is full!");
                break;
            }
        }
        if(!this.status){
            this.drawOsc();
        }
    },
    //create SVG line depends on data from ringBuffer
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
                // console.log("Warning!");
                // console.log((((highByte & 0xFF) << 8) + lowByte));
            }
            if(typeof lowByte != "undefined"){
                let point = parseInt((((highByte & 0xF) << 8) + lowByte - 2048) * 1089 / 4096);
                this.line += `L${this.index * 2} ${150 - point}`;
                this.index++;
            }
            if(this.index >= 160){
                this.index = 0;
                document.getElementById("signal").setAttribute("d", this.line);
                this.line = "M-1 150";
            }
            if(this.ringBuffer.dataLen > 1){
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
    //clear SVG line
    clearOsc: function(){
        this.line = "M-1 150";
        document.getElementById("signal").setAttribute("d", this.line);
    }
}

let vacmeter = {
    ringBuffer: new RingBuffer(4096),
    dataX: [],
    dataY: [],
    drawD3jsPlot: 1,
    startStr: new TextEncoder().encode("start"),
    stopStr: new TextEncoder().encode("stop"),
    index: 0,
    status: {
        counter: 0,
        startIdx: -1,
        stopIdx: -1,
        drawing: 0
    },
    line: undefined,
    init: function(){
        window.addEventListener("load", () => {
            this.line = document.getElementById("signal").getAttribute("d");
        });
    },
    //put bytes from chunk to ringBuffer
    putBytesToArray: function(chunk){
        for(let byte = 0; byte < chunk.length; byte++){
            if(!this.ringBuffer.putToEnd(chunk[byte])){
                console.log("Buffer is full!");
                this.ringBuffer.erase();
                break;
            }
            if(this.status.startIdx === -1){
                if(chunk[byte] === this.startStr[this.status.counter]){
                    this.status.counter++;
                }
                else{
                    this.status.counter = 0;
                }
                if(this.status.counter === this.startStr.length){
                    this.status.startIdx = this.ringBuffer.ptrEnd;
                    this.status.counter = 0;
                }
            }
            if(this.status.stopIdx === -1 && this.status.startIdx > -1){
                if(chunk[byte] === this.stopStr[this.status.counter]){
                    this.status.counter++;
                }
                else{
                    this.status.counter = 0;
                }
                if(this.status.counter === this.stopStr.length){
                    this.status.stopIdx = this.ringBuffer.ptrEnd - this.stopStr.length;
                    if(this.status.stopIdx < 0){
                        this.status.stopIdx += this.ringBuffer.size;
                    }
                    this.status.counter = 0;
                }
            }
        }
        if(this.status.startIdx > -1 && this.status.stopIdx > -1){
            const ptrBegin = this.status.startIdx;
            const ptrEnd = this.status.stopIdx;
            this.ringBuffer.dataLen = (ptrEnd > ptrBegin ? ptrEnd - ptrBegin : this.ringBuffer.size + ptrEnd - ptrBegin);
            this.ringBuffer.ptrBegin = ptrBegin;
            this.ringBuffer.ptrEnd = ptrEnd;
            //console.log(this.ringBuffer.dataLen);
            //console.log(this.ringBuffer.buffer.join(", "));
            this.drawVac();
        }
    },
    //create SVG line depends on data from ringBuffer
    drawVac: function(){
        //maxHeight: 300
        //maxWidth: 1000
        return new Promise((resolve, reject) => {
            //console.log(this.ringBuffer.dataLen);
            if(this.ringBuffer.dataLen < 2){
                resolve(0);
            }
            let lowByte = this.ringBuffer.getFromBegin();
            let highByte = this.ringBuffer.getFromBegin();
            //let lowX = this.ringBuffer.getFromBegin();
            //let highX = this.ringBuffer.getFromBegin();
            this.dataY.push((highByte << 8) + lowByte);
            //this.dataX.push((highX << 8) + lowX);
            //console.log([highByte, lowByte]);
            if(highByte & 0xF0){
                //highByte = lowByte;
                //lowByte = this.ringBuffer.getFromBegin();
                console.log("Warning!");
                console.log((((highByte & 0xFF) << 8) + lowByte).toString(16));
            }
            if(typeof lowByte != "undefined"){
                let point = parseInt((((highByte) << 8) + lowByte) * 300 / 4096);
                this.line += `L${this.index * 2} ${300 - point}`;
                this.index++;
            }
            if(this.index % 10 === 0){
                document.getElementById("signal").setAttribute("d", this.line);
            }
            if(this.index >= 500){
                this.index = 0;
                document.getElementById("signal").setAttribute("d", this.line);
                this.line = "M-1 150";
            }
            if(this.ringBuffer.dataLen > 1){
                resolve(1);
            }
            resolve(0);
        }).then((res) => {
            this.status.drawing = res;
            if(res){
                return this.drawVac();
            }
            else{
                if(this.drawD3jsPlot){
                    if(typeof(plot) === "function" && this.dataY.length){
                        // const minX = Math.min(...this.dataX);
                        // const maxX =  Math.max(...this.dataX);
                        const minX = 0;
                        const maxX =  3.3;
                        function prettify(x, offset){
                            return (minX + (maxX - minX) * offset);
                        }
                        this.dataX = this.dataY.map((y, idx) => {return prettify(y, idx / this.dataY.length)});
                        let start = -1;
                        let finish = -1;
                        for(let i = 10; i < this.dataY.length - 10; i++){
                            if((this.dataY[i - 10] + this.dataY[i - 5] + this.dataY[i] + this.dataY[i + 5] + this.dataY[i + 10]) > 0){
                                if(start === -1){
                                    start = i;
                                }
                                else{
                                    finish = i;
                                }
                            }
                            else if(start > -1 && finish === -1){
                                finish = i;
                            }
                        }
                        let node;
                        if(start > -1 && finish > -1){
                            this.dataX = this.dataX.slice(start, finish);
                            this.dataY = this.dataY.slice(start, finish);
                            y = this.dataY.map((y, idx) => {
                                if(idx < 2 || idx > this.dataY.length - 2){
                                    return(y * 35.37 / 4096);
                                }
                                else{
                                    return((this.dataY[idx - 2] + this.dataY[idx - 1] + y + this.dataY[idx + 1] + this.dataY[idx + 2]) * 7.074 / 4096);
                                }
                            });
                            node = plot(this.dataX.map((x, idx) => ({x, y: y[idx]})));
                        }
                        if(node){
                            const container = document.getElementById("d3jsPlot");
                            while (container.firstChild) {
                                container.removeChild(container.firstChild);
                            }
                            document.getElementById("d3jsPlot").append(node);
                        }
                    }
                }
                //this.drawD3jsPlot = 0;
                this.dataX = [];
                this.dataY = [];
                this.index = 0;
                this.status.drawing = 0;
                this.status.startIdx = -1;
                this.status.stopIdx = -1;
                this.ringBuffer.erase();
                this.line = "M-1 150";
            }
        })
    },
    //clear SVG line
    clearVac: function(){
        this.index = 0;
        this.status.drawing = 0;
        this.status.startIdx = -1;
        this.status.stopIdx = -1;
        this.ringBuffer.erase();
        this.line = "M-1 150";
        document.getElementById("signal").setAttribute("d", this.line);
    }
}


let serialPortManager = {
    serialPort: undefined,
    reader: undefined,
    fileContent: "",
    fileLength: 0,
    decoder: {
        dataTypes: ["HEX", "Текст"],
        currentType: 0,
    },
    terminalText: undefined,
    deviceFilters: [
        //{ usbVendorId: 0x0403},
    ],
    port: {
        deviceFilters: [],
        portParams: {
            baudRate: 300,
            bufferSize: 1024,
        },
        baudRates: [300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600],
        currentBaudRate: 0,
    },
    controlsIDs: {
        connect: "connectDevice",
        incBaud: "incSpeed",
        decBaud: "decSpeed",
        disconnect: "disconnectDevice",
        startReading: "readDataFromDevice",
        stopReading: "stopReadingData",
        clearText: "clearData",
        downloadText: "saveData",
        decodeData: "switchDataTypeL",
        decodeDataR: "switchDataTypeR",
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
                return false;
            }
        }
        catch(err){
            this.showNotification(err.message);
            console.trace(err);
            return false;
        }
        return true;
    },
    copyToClipboard: function(text){
        if(navigator.clipboard){
            navigator.clipboard.writeText(text + "").then((r) => {
                this.showNotification("Copied to clipboard");
            }).catch((err) => {
                this.showNotification(err.message);
                console.trace(err);
            });
        }
        else{
            this.showNotification("uups, no clipboard support");
        }
    },
    saveToFile: function(content, filename){
        const href = URL.createObjectURL(new Blob([content + ""], { type: 'text/plain' }));
        const a = document.createElement("a");
        a.style = "display: none";
        document.body.appendChild(a);
        a.href = href;
        a.download = "" + filename;
        a.click();
    },
    init: function(){
        window.addEventListener("load", () => {
            if(!this.checkNavigator()){
                this.showNotification("No serial Port support in your browser!<br>More information about <a href='https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API'>Web Serial API</a>");
                return;
            }
            this.showNotification("Добро пожаловать!<br>Это терминал для работы с USART<br><a href='https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API'>Как это работает</a>");
            document.querySelector(".terminal").addEventListener("click", (event) => {
                if(event.target.id){
                    this.terminalControls(event.target.id);
                }
            });
            this.terminalText = document.getElementById("terminalText");
            this.updateTerminalStatus({type: "device", value: "waiting"});
            this.updateTerminalStatus({type: "text", value: "stopped"});
            this.updateTerminalStatus({type: "chart", value: "stopped"});
            document.getElementById("baudRate").innerHTML = `${this.port.baudRates[this.port.currentBaudRate]} бод`;
            document.getElementById("dataType").innerHTML = this.decoder.dataTypes[this.decoder.currentType];
            this.port.portParams.baudRate = this.port.baudRates[this.port.currentBaudRate];
        });
    },
    connectToPort: function(){
        if(!this.checkNavigator()){
            return;
        }
        navigator.serial.requestPort({filters: this.deviceFilters}).then((port) => {
            if(port){
                return port.open(this.port.portParams).then(()=>{
                    this.serialPort = port;
                    this.portStatus.connected = true;
                    this.showNotification("Connected!");
                    this.updateButton(this.controlsIDs.connect, this.controlsIDs.disconnect);
                    this.updateTerminalStatus({type: "device", value: "active"});
                });
            }
        }).catch((err) => {
            this.showNotification(err.message);
            console.trace(err);
            if(navigator.platform.includes("Linux") && err.message.includes("Failed to open")){
                setTimeout(() => {
                    const command = "<u><b>chmod 666 /dev/ttyUSB[n]</b></u>"
                    this.showNotification(`use command <br>${command}<br> to enable reading/writing to this port`);
                }, 500);
            }
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
                //console.log(+new Date());
                if(done){
                    // Allow the serial port to be closed later.
                    reader.releaseLock();
                    break;
                }
                // value is a Uint8Array.
                //console.log(value);
                // const now = +new Date();
                // console.log(now - this.timer, value.length);
                // this.timer = now;
                if(this.portStatus.reading){
                    if(this.decoder.currentType){
                        let text = decoder.decode(value);
                        this.updateTerminalText(text);
                        this.fileContent += text;
                        this.fileLength += text.length;
                    }
                    else{
                        this.updateTerminalText(Array.from(value).map((e) => "0x" + `00${e.toString(16)}`.slice(-2)).join(" ") + " ");
                    }
                    for(let v of value){
                        // if(this.fileLength > 1000){
                        //     this.saveToFile(this.fileContent, "output.csv");
                        //     this.fileContent = "";
                        //     this.fileLength = 0;
                        // }
                        // this.fileContent += v + ";";
                        // this.fileLength++;
                        // if(this.fileLength % 10 === 0){
                        //     this.fileContent += "\n";
                        // }
                    }
                }
                if(this.portStatus.drawing){
                    vacmeter.putBytesToArray(value);
                }
                // this.updateTerminalText(decoder.decode(value));
            }
        }
        catch(err){
            this.showNotification(err.message);
            console.trace(err);
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
            case this.controlsIDs.decBaud:
                this.port.currentBaudRate--;
                if(this.port.currentBaudRate < 0){
                    this.port.currentBaudRate = this.port.baudRates.length - 1;
                }
                this.port.portParams.baudRate = this.port.baudRates[this.port.currentBaudRate];
                document.getElementById("baudRate").innerHTML = `${this.port.baudRates[this.port.currentBaudRate]} бод`;
                break;
            case this.controlsIDs.incBaud:
                this.port.currentBaudRate++;
                if(this.port.currentBaudRate >= this.port.baudRates.length){
                    this.port.currentBaudRate = 0;
                }
                this.port.portParams.baudRate = this.port.baudRates[this.port.currentBaudRate];
                document.getElementById("baudRate").innerHTML = `${this.port.baudRates[this.port.currentBaudRate]} бод`;
                break;
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
                        this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading, this.controlsIDs.downloadText);
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
                    vacmeter.clearVac();
                });
                break;
            case this.controlsIDs.startReading:
                if(this.portStatus.reading || !this.portStatus.connected){
                    break;
                }
                this.portStatus.reading = true;
                this.updateTerminalStatus({type: "text", value: "active"});
                this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading, this.controlsIDs.clearText, this.controlsIDs.downloadText);
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
                this.updateButton(this.controlsIDs.startReading, this.controlsIDs.stopReading, this.controlsIDs.downloadText);
                break;
            case this.controlsIDs.clearText:
                this.updateTerminalText("", true);
                this.fileContent = "";
                this.fileLength = 0;
                if(!this.portStatus.reading || !this.portStatus.connected){
                    this.updateButton(this.controlsIDs.clearText);
                }
                break;
            case this.controlsIDs.downloadText:
                if(!this.portStatus.reading){
                    break;
                }
                this.saveToFile(this.fileContent, "output.csv");
                this.fileContent = "";
                this.fileLength = 0;
                break;
            case this.controlsIDs.decodeData:
            case this.controlsIDs.decodeDataR:
                this.decoder.currentType ^= 1;
                document.getElementById("dataType").innerHTML = this.decoder.dataTypes[this.decoder.currentType];
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
        let nt = document.createElement("div");
        nt.classList.add("tooltip");
        nt.innerHTML = text;
        document.querySelector(".tooltips").append(nt);
        setTimeout(() => {nt.classList.add("tooltip-enable");}, 10);
        setTimeout(() => {
            nt.classList.remove("tooltip-enable");
            setTimeout(() => {nt.remove()}, 500);
        }, 5000);
    },
}

oscilloscope.init();
vacmeter.init();
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