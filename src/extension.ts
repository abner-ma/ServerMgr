// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {execSync} from 'child_process';
import { resolve } from 'path';
import { rejects } from 'assert';
import { error } from 'console';
import * as ping from 'ping';

interface ServerHost {
	hostip: string;
	bmcip: string;
	bmcUser: string;
	bmcPasswd: string;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "servermgr" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('servermgr.mgrcmd', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from ServerMgr!');
		let getConf:ServerHost[];
		getConf = vscode.workspace.getConfiguration().get<Array<ServerHost>>('my.hostlist')||[];
		
		let panel = vscode.window.createWebviewPanel(
			'myWebview', // 标识符，需要唯一
			'My Webview', // 标题
			vscode.ViewColumn.One, // 第一列
			{ enableScripts: true } // 启用 JavaScript
		);
		// 设置HTML内容
		panel.webview.html = getWebviewContent(getConf);
		panel.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'pingAllHosts':
					vscode.window.showInformationMessage('ping All Hosts!');
					for (let i = 0; i < getConf.length; i++) {
						checkHostPing(getConf[i].hostip)
						.then((reachable)=>{
							if(reachable) {
								panel.webview.postMessage({ command: 'pingSuccess',data: i.toString()});
							}else{
								panel.webview.postMessage({ command: 'pingFail',data: i.toString()});
							}
						})
						.catch((error)=>{
							panel.webview.postMessage({ command: 'pingFail',data: i.toString()});
						});
					}
					break;
				case 'pingHost':
					let hostIndex:number = getHostipIndex(message.text,getConf);
					checkHostPing(getConf[hostIndex].hostip)
						.then((reachable)=>{
							if(reachable) {
								panel.webview.postMessage({ command: 'pingSuccess',data: hostIndex.toString()});
								vscode.window.showInformationMessage("ping "+message.text);
							}else{
								panel.webview.postMessage({ command: 'pingFail',data: hostIndex.toString()});
							}
						})
						.catch((error)=>{
							panel.webview.postMessage({ command: 'pingFail',data: hostIndex.toString()});
						});
					break;
				case 'pingAllBMC':
					vscode.window.showInformationMessage('ping All Hosts BMC!');
					for (let i = 0; i < getConf.length; i++) {
						checkHostPing(getConf[i].bmcip)
						.then((reachable)=>{
							if(reachable) {
								panel.webview.postMessage({ command: 'pingBMCSuccess',data: i.toString()});
							}else{
								panel.webview.postMessage({ command: 'pingBMCFail',data: i.toString()});
							}
						})
						.catch((error)=>{
							panel.webview.postMessage({ command: 'pingBMCFail',data: i.toString()});
						});
					}
					break;
				case 'pingHostBMC':
					let hostBMCIndex:number = getHostBMCipIndex(message.text,getConf);
					checkHostPing(getConf[hostBMCIndex].bmcip)
						.then((reachable)=>{
							if(reachable) {
								panel.webview.postMessage({ command: 'pingBMCSuccess',data: hostBMCIndex.toString()});
								vscode.window.showInformationMessage("ping "+message.text);
							}else{
								panel.webview.postMessage({ command: 'pingBMCFail',data: hostBMCIndex.toString()});
							}
						})
						.catch((error)=>{
							panel.webview.postMessage({ command: 'pingBMCFail',data: hostBMCIndex.toString()});
						});
					break;
				case 'BMCSwitch':
					let hostPowerBMCIndex:number = getHostBMCipIndex(message.text,getConf);
					let hostPowerStatus:boolean = getIPMIPowerStatus(getConf[hostPowerBMCIndex].bmcip,getConf[hostPowerBMCIndex].bmcUser,getConf[hostPowerBMCIndex].bmcPasswd);
					console.log(`${getConf[hostPowerBMCIndex].bmcip} powerstatus:${hostPowerStatus}`);
					doIPMICMD(getConf[hostPowerBMCIndex].bmcip,getConf[hostPowerBMCIndex].bmcUser,getConf[hostPowerBMCIndex].bmcPasswd,!hostPowerStatus);
					if (hostPowerStatus) {
						panel.webview.postMessage({ command: 'BMCPowerOff',data: hostPowerBMCIndex.toString()});
					}else{
						panel.webview.postMessage({ command: 'BMCPowerOn',data: hostPowerBMCIndex.toString()});
					}
					break;
			}
		});
	});

	context.subscriptions.push(disposable);
}

function getWebviewContent(confCtx:Array<ServerHost>) {
	confCtx.forEach(element => {
		console.log(`${element.hostip}:${element.bmcip}`);
	});
	let serverHostNum = confCtx.length;
    return`
      <html>
        <body>
		  <table id="serverhosttable">
			<tr>
				<th>Host IP</th>
				<th>connection status</th>
				<th>BMC IP</th>
				<th>BMC IP ping</th>
				<th>power status</th>
				<th>power control</th>
			</tr>
			${confCtx.map(row => `
				<tr>
					<td bgcolor="red">${row.hostip}</td>
					<td><button class="hostbtn" id="${row.hostip}btn">ping ${row.hostip}</button></td>
					<td>${row.bmcip}</td>
					<td><button class="bmcbtn" id="${row.bmcip}">ping bmc ${row.bmcip}</button></td>
					<td>${row.bmcip}</td>
					<td><button class="bmcPowerbtn" id="${row.bmcip}pow">switch bmc ${row.bmcip} power</button></td>
				</tr>
			`)}
		  </table>
		  <button class="hostsbtn" id="pingAllBtn">ping All ${serverHostNum} Host</button>
		  <button class="bmcsbtn" id="pingAllBMCBtn">ping All ${serverHostNum} BMC</button>
          <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('pingAllBtn').addEventListener('click', () => {
              vscode.postMessage({ command: 'pingAllHosts',text: null });
            });
			document.getElementById('pingAllBMCBtn').addEventListener('click', () => {
				vscode.postMessage({ command: 'pingAllBMC',text: null });
			});
			let hostbtn = document.querySelectorAll('.hostbtn');
			let hostbtnIds = [];
			hostbtn.forEach(function(button){
				hostbtnIds.push(button.id);
				document.getElementById(button.id).addEventListener('click', () => {
					vscode.postMessage({ command: 'pingHost',text: button.id.slice(0,-3) });
				});
			});
			let bmcbtn = document.querySelectorAll('.bmcbtn');
			let bmcbtnIds = [];
			bmcbtn.forEach(function(button){
				bmcbtnIds.push(button.id);
				document.getElementById(button.id).addEventListener('click', () => {
					vscode.postMessage({ command: 'pingHostBMC',text: button.id });
				});
			});
			let bmcpowerbtn = document.querySelectorAll('.bmcPowerbtn');
			let bmcpowerbtnIds = [];
			bmcpowerbtn.forEach(function(button){
				bmcpowerbtnIds.push(button.id);
				document.getElementById(button.id).addEventListener('click', () => {
					vscode.postMessage({ command: 'BMCSwitch',text: button.id.slice(0,-3) });
				});
			});
			window.addEventListener('message',event =>{
				let tableId = document.getElementById('serverhosttable');
				let hostIndex;
				const {command,data} = event.data;
				switch (command) {
					case "pingSuccess":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[0].style.backgroundColor='green';
						break;
					case "pingFail":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[0].style.backgroundColor='red';
						break;
					case "pingBMCSuccess":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[2].style.backgroundColor='green';
						break;
					case "pingBMCFail":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[2].style.backgroundColor='red';
						break;
					case "BMCPowerOn":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[4].style.backgroundColor='green';
						break;
					case "BMCPowerOff":
						hostIndex = Number(data)+1;
						tableId.rows[hostIndex].cells[4].style.backgroundColor='red';
						break;
				}
			});
          </script>
        </body>
      </html>
    `;
}

function getHostipIndex(targetStr:string,confCtx:Array<ServerHost>):number {
	let indexnum:number = -1;
	for (let i = 0; i < confCtx.length; i++){
		if (targetStr === confCtx[i].hostip) {
			indexnum = i;
			break;
		}
	}
	return indexnum;
}

function getHostBMCipIndex(targetStr:string,confCtx:Array<ServerHost>):number {
	let indexnum:number = -1;
	for (let i = 0; i < confCtx.length; i++){
		if (targetStr === confCtx[i].bmcip) {
			indexnum = i;
			break;
		}
	}
	return indexnum;
}

async function checkHostPing(host:string):Promise<boolean> {
	return new Promise((resolve,rejects)=>{
		ping.promise.probe(host)
		.then((isAlive)=>{
			console.log(`ping ${host},${isAlive.alive}`);
			resolve(isAlive.alive);
		})
		.catch((err)=>{
			rejects(false);
		});
	});
}

function  getIPMIPowerStatus(ipAddr:string,ipmiuser:string,ipmipasswd:string):boolean {
	const cmd = `ipmitool -H ${ipAddr} -U ${ipmiuser} -P ${ipmipasswd} power status`;
	console.log(cmd);
	const result = execSync(cmd,{
		encoding:'utf8',
	});
	if (result.startsWith('Chassis Power is on')) {
		return true;
	}
	console.log(`ipmitool ${ipAddr} :${result.toString()}`);
	return false;
}

function  doIPMICMD(ipAddr:string,ipmiuser:string,ipmipasswd:string,powerStatus:boolean) {
	let result;
	if (powerStatus) {
		result = execSync(`ipmitool -H ${ipAddr} -U ${ipmiuser} -P ${ipmipasswd} power on`,{
			encoding:'utf8',
		});
	}else{
		result = execSync(`ipmitool -H ${ipAddr} -U ${ipmiuser} -P ${ipmipasswd} power off`,{
			encoding:'utf8',
		});
	}
	
	console.log(`ipmitool ${ipAddr} :${result.toString()}`);
}

// This method is called when your extension is deactivated
export function deactivate() {}
