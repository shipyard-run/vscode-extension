import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { isAllowedOverwriting, isAskingForConfirmation } from './settings';

interface TConfig {
    tabs: TTab[];
    terminals: TTerminal[];
}

interface TTab {
  uri: string;
  title: string;
  viewColumn: vscode.ViewColumn;
}

interface TTerminal {
  name: string;
  command: string;
  viewColumn: vscode.ViewColumn;
}

const emptyConfig: TConfig = {
  tabs: [],
  terminals: [],
};

const panels: vscode.WebviewPanel[] = [];

function getConfigPath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders === undefined || workspaceFolders.length === 0) {
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const vscodePath = `${rootPath}${path.sep}.vscode`;
  if (fs.existsSync(vscodePath) === false) {
    fs.mkdirSync(vscodePath);
  }
  return `${vscodePath}${path.sep}shipyard.json`;
}

function getConfig(configPath: string): TConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config: TConfig = JSON.parse(content);
    if (Array.isArray(config.tabs) === false) {
      throw new Error();
    }
    return config;
  } catch (err) {
    fs.writeFileSync(configPath, JSON.stringify(emptyConfig, null, 2));
    return { ...emptyConfig };
  }
}

export async function restoreEditors() {
  const configPath = getConfigPath();
  if (configPath === undefined) {
    return;
  }

  const config: TConfig = getConfig(configPath);

  config.tabs.forEach(async (tab) => {
    const uri = vscode.Uri.parse(tab.uri);
    if(uri.scheme === 'http' || uri.scheme === 'https') {
      openHtml(tab.uri, tab.title);
    } else {
      openFile(tab.uri);
    }
  });
  
  config.terminals.forEach(async (terminal) => {
    openTerminal(terminal.command, terminal.name);
  });
}

async function openFile(uri: string) {
  const options: vscode.TextDocumentShowOptions = {
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  };

  const filePath = path.join(vscode.workspace.rootPath || '', uri);
  const docURI = vscode.Uri.file(filePath);

  const files = await vscode.workspace.textDocuments.filter(doc => doc.fileName === docURI.fsPath);

  if (files.length === 0) {
    console.log("openFile: " + filePath);
    // no active file, open it and return
    const doc = await vscode.workspace.openTextDocument(docURI);
    await vscode.window.showTextDocument(doc, options);
    return;
  }

  // if we have the window open and it is not active just show it
  for await (const doc of files){
    if(vscode.window.activeTextEditor?.document.fileName !== doc.fileName){
      console.log("openFile: " + filePath);
      vscode.window.showTextDocument(doc, options).then((editor) => {}).then(undefined, err => {});
    }
  }
}

async function openTerminal(command: string, name: string) {
  // if we have a terminal with the same name, grab it
  let term: vscode.Terminal | undefined = vscode.window.terminals.find((term) => term.name === name);

  // if not create a new one
  if (term === undefined) {
    term = vscode.window.createTerminal(name);
  }

  term?.show();

  if (command !== '') {
    term?.sendText(command);
  }
}

async function openHtml(uri: string, title: string) {
  // if the panel is open close it
  panels.forEach((panel, index) => {
    if (panel.title === title) {
      panel.dispose();
      panels.splice(index, 1);
    }
  });

  const panel = vscode.window.createWebviewPanel(
    'openWebview',
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panels.push(panel);

  panel.webview.html = 
  `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cat Coding</title>
          <style>
            iframe {
              height: 100vh;
              background-color: #FFF;
            }

            body {
              padding: 0;
              margin: 0;
              height: 100%;
            }

            ul {
              list-style-type: none;
              margin: 0;
              padding: 0;
              overflow: hidden;
              background-color: #333;
            }
            
            li {
              float: left;
            }

            li div {
              display: block;
              color: white;
              font-size: 16px;
              text-align: center;
              padding: 14px 16px;
              text-decoration: none;
            }
            
            li a {
              font-size: 16px;
              display: block;
              color: white;
              text-align: center;
              padding: 14px 16px;
              text-decoration: none;
            }
            
            /* Change the link color to #111 (black) on hover */
            li a:hover {
              background-color: #111;
            }
          </style>
          <script>
            const vscode = acquireVsCodeApi();
            function openFile(uri) {
              vscode.postMessage({
                function: 'openFile',
                uri: uri
              });
            }
          
            function openHtml(uri, title) {
              vscode.postMessage({
                function: 'openHtml',
                uri: uri,
                title: title,
              });
            }
            
            function openTerminal(command, name) {
              vscode.postMessage({
                function: 'openTerminal',
                command: command,
                name: name,
              });
            }

            function displayMessage (evt) {
              console.log(evt.data);
              if (evt.data.function === 'openHtml') {
                openHtml(evt.data.uri,evt.data.title);
              }
              
              if (evt.data.function === 'openFile') {
                openFile(evt.data.uri,evt.data.title);
              }
              
              if (evt.data.function === 'openTerminal') {
                openTerminal(evt.data.command,evt.data.name);
              }
            }
            
            if (window.addEventListener) {
              window.addEventListener("message", displayMessage, false);
            }
            else {
              window.attachEvent("onmessage", displayMessage);
            }

            function reloadIFrame() {
              document.getElementById('content').src = document.getElementById('content').src
            }
          </script>
      </head>
      <body>
          <ul>
            <li><div>${uri}</div></li>
            <li style="float:right"><a class="active" href="#" onclick="reloadIFrame()">&#x27F3</a></li>
          </ul>
          <iframe width="100%" height="100%" src="${uri}" frameborder="0" id="content"></iframe>
      </body>
      </html>`;
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.function) {
        case 'openFile':
          openFile(message.uri);
          return;
        case 'openHtml':
          openHtml(message.uri, message.title);
          return;
        case 'openTerminal':
          openTerminal(message.command, message.name);
          return;
      }
    },
    undefined,
    undefined //do we need to set this?
  );
}