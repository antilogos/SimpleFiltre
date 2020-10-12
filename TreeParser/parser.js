// Function found on the web to decode Base64 in pure javascript
function decodeBase64(s) {
	var e={},i,b=0,c,x,l=0,a,r='',w=String.fromCharCode,L=s.length;
	var A="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	for(i=0;i<64;i++){e[A.charAt(i)]=i;}
	for(x=0;x<L;x++){
		c=e[s.charAt(x)];b=(b<<6)+c;l+=6;
		while(l>=8){((a=(b>>>(l-=8))&0xff)||(x<(L-2)))&&(r+=w(a));}
	}
	return r;
};
	
function parseUrl(u) {
	// Converting url encoded in base64 with some quirks into binary
    let buffer = decodeBase64(u.split("/").pop().replaceAll("-","+").replaceAll("_","/"));
	let reader = new Uint8Array(buffer.length);
	for(let i = 0; i < buffer.length; i++){
		reader[i] = buffer[i].charCodeAt(0);
	}
	// do something with each byte in the array
	let view = new DataView(reader.buffer, 0);

	// This is how the passive skill tree url is
	const version = view.getInt32(0);
	const characterClass = view.getInt8(4);
	const ascendancyClass = view.getInt8(5);
	const isFullscreen = view.getInt8(6);

	// List of passiveNodes are Int16 from offset 5
	var passiveNodes = [];
	for(var i = 7; i < buffer.length; i+=2){
		try {
	  		passiveNodes.push(view.getUint16(i));
		} catch (error) {
  			console.error(error);
		}
	}

	return passiveNodes;
};

// Take the passive skill tree and extract all the nodes that are relevant with added coordinates
function extractNodesData(jsonData) {
	// keep a map of nodes that matters
	const nodeMap = new Map();
	for( let[key, value] of Object.entries(passiveSkillTreeData.nodes)) {
		// No ascendencies, no placeholder masteries, no annointed-only and no cluster jewels
		if(!value.isAscendancyStart && !value.isMultipleChoice && !value.isMultipleChoiceOption 
									&& !value.isMastery && !value.ascendancyName 
									&& !value.isBlighted && (!value.spc || value.spc.length == 0)) {
			nodeMap[key] = value;
		}
	}

	// Parse the groups to get coordinate of the center of circle if needed
	for( let [key, value] of Object.entries(passiveSkillTreeData.groups)) {
		if(!value.isProxy) {
			// Orbit are at radius 0 when node is at the center
			for( let orbit of value.orbits) {
				// get the radius of the orbits from the groupNode
				const radius = passiveSkillTreeData.constants.orbitRadii[orbit];		    
				// Read only the nodes that matters and on that orbit
				const filteredNode = value.nodes.filter(function (node) {return nodeMap[node] && nodeMap[node].orbit == orbit; });

				for( let node of filteredNode) {
					const nodeObject = nodeMap[node];
					// Number of point on the circle
					const skillOrbit = passiveSkillTreeData.constants.skillsPerOrbit[nodeObject.orbit];
					// Place the node in the orbit and use orbit position to get him at the right location
					if(skillOrbit != 0 && radius != 0) {
						nodeObject.x = value.x + (Math.sin(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
						nodeObject.y = value.y - (Math.cos(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
					} else {
						nodeObject.x = value.x;
						nodeObject.y = value.y;
					}
					nodeObject.id = node;
					// Store back the coordinates
					nodeMap[node] = nodeObject;
				}
			}
		}
	}
	return nodeMap;
};

function buildSvgNode(node) {
	const nodePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	nodePoint.setAttribute("cx", node.x);
	nodePoint.setAttribute("cy", node.y);
	
	if(node.isKeystone) {
		nodePoint.setAttribute("fill", "#F00");
		nodePoint.setAttribute("r", 96);
	} else if(node.isNotable) {
		nodePoint.setAttribute("fill", "#F00");
		nodePoint.setAttribute("r", 64);
	} else if(node.isJewelSocket) {
		nodePoint.setAttribute("fill", "none");
		nodePoint.setAttribute("stroke", "#000");
		nodePoint.setAttribute("stroke-width", "16");
		nodePoint.setAttribute("r", 58);
	} else if(node.grantedStrength && node.grantedStrength == 10 && !node.grantedIntelligence && !node.grantedDexterity) {
		nodePoint.setAttribute("fill", "#A00");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedDexterity && node.grantedDexterity == 10 && !node.grantedStrength && !node.grantedIntelligence) {
		nodePoint.setAttribute("fill", "#0A0");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedIntelligence && node.grantedIntelligence == 10 && !node.grantedStrength && !node.grantedDexterity) {
		nodePoint.setAttribute("fill", "#00A");
		nodePoint.setAttribute("r", 32);
	} else {
		nodePoint.setAttribute("fill", "#222");
		nodePoint.setAttribute("r", 32);
	}
	nodePoint.setAttribute("id", "node_"+node.id);
	
	return nodePoint;
};

function buildSvgConnection(origin, dest, orbitMap, radiiMap) {
	let numberInOrbit = orbitMap[dest.orbit];
	// If nodes are of the same group with orbit, draw arc
	if(dest.group == origin.group && dest.orbit == origin.orbit && numberInOrbit != 0) {
		const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "path");
		let diffIndexOrbit = dest.orbitIndex - origin.orbitIndex;
		let isBefore = "1";
		if((diffIndexOrbit > 0 && diffIndexOrbit < numberInOrbit/2) || (diffIndexOrbit < 0 && diffIndexOrbit + numberInOrbit < numberInOrbit/2) ) isBefore = "1";
		else isBefore = "0";
		//if(value.orbitIndex > target.orbitIndex) isBefore = "0";
		nodeConnection.setAttribute("d", ["M",origin.x,origin.y,"A",radiiMap[dest.orbit],radiiMap[dest.orbit],"0","0",isBefore,dest.x,dest.y].join(" "));
		nodeConnection.setAttribute("fill", "none");
		nodeConnection.setAttribute("stroke", "#000");
		nodeConnection.setAttribute("stroke-width", "24");
		return nodeConnection;
	// If not, draw line
	} else {
		const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "line");
		nodeConnection.setAttribute("x1", origin.x);
		nodeConnection.setAttribute("y1", origin.y);
		nodeConnection.setAttribute("x2", dest.x);
		nodeConnection.setAttribute("y2", dest.y);
		nodeConnection.setAttribute("style", "stroke:#000;stroke-width:24");
		return nodeConnection;
	}
};


function buildPath(nodeArray, style, svg, nodeMap, orbitMap, radiiMap) {
	var filteredNode = [];
	var svgElements = [];
	for( let origin of Object.values(nodeArray)) {
        	if(nodeMap[origin]) {
			filteredNode[origin] = nodeMap[origin];
		}
	}
	// Draw array by getting all nodes and cheking their out
	for( let [key, origin] of Object.entries(filteredNode)) {
		if(origin.x && origin.y && origin.out) {
			for( let value of origin.out) {
				if(filteredNode[value]) {
					let dest = filteredNode[value];
					let numberInOrbit = orbitMap[dest.orbit];
					// If nodes are of the same group with orbit, draw arc
					if(dest.group == origin.group && dest.orbit == origin.orbit && numberInOrbit != 0) {
						const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "path");
						let diffIndexOrbit = dest.orbitIndex - origin.orbitIndex;
						let isBefore = "1";
						if((diffIndexOrbit > 0 && diffIndexOrbit < numberInOrbit/2) || (diffIndexOrbit < 0 && diffIndexOrbit + numberInOrbit < numberInOrbit/2) ) isBefore = "1";
						else isBefore = "0";
						//if(value.orbitIndex > target.orbitIndex) isBefore = "0";
						nodeConnection.setAttribute("d", ["M",origin.x,origin.y,"A",radiiMap[dest.orbit],radiiMap[dest.orbit],"0","0",isBefore,dest.x,dest.y].join(" "));
						nodeConnection.setAttribute("fill", "none");
						nodeConnection.setAttribute("style", style);
						svg.appendChild(nodeConnection);
						svgElements.push(nodeConnection);
					// If not, draw line
					} else {
						const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "line");
						nodeConnection.setAttribute("x1", origin.x);
						nodeConnection.setAttribute("y1", origin.y);
						nodeConnection.setAttribute("x2", dest.x);
						nodeConnection.setAttribute("y2", dest.y);
						nodeConnection.setAttribute("style", style);
						svg.appendChild(nodeConnection);
						svgElements.push(nodeConnection);	
					}
				}
			}
		}
	}
	return svgElements;
};

function buildContext(labels, pos, svg) {
	const contextBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
	contextBox.setAttribute("x", pos[0]);
	contextBox.setAttribute("y", pos[1]);
	contextBox.setAttribute("rx", 128);
	contextBox.setAttribute("ry", 128);
	contextBox.setAttribute("width", 5000);
	contextBox.setAttribute("height", 4800);
	contextBox.setAttribute("stroke", "black");
	contextBox.setAttribute("fill", "white");
	contextBox.setAttribute("stroke-width", 64);
	svg.appendChild(contextBox);

	const lineB1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineB1.setAttribute("x1", pos[0]+500);
	lineB1.setAttribute("y1", pos[1]+400);
	lineB1.setAttribute("x2", pos[0]+1500);
	lineB1.setAttribute("y2", pos[1]+400);
	lineB1.setAttribute("stroke", "#7C7");
	lineB1.setAttribute("stroke-width", 128);
	lineB1.setAttribute("stroke-linecap","round");
	svg.appendChild(lineB1);
	const lineB2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineB2.setAttribute("x1", pos[0]+500);
	lineB2.setAttribute("y1", pos[1]+400+300);
	lineB2.setAttribute("x2", pos[0]+1500);
	lineB2.setAttribute("y2", pos[1]+400+300);
	lineB2.setAttribute("stroke", "#090");
	lineB2.setAttribute("stroke-width", 128);
	lineB2.setAttribute("stroke-linecap","round");
	svg.appendChild(lineB2);
	const lineB3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineB3.setAttribute("x1", pos[0]+500);
	lineB3.setAttribute("y1", pos[1]+400+900);
	lineB3.setAttribute("x2", pos[0]+1500);
	lineB3.setAttribute("y2", pos[1]+400+900);
	lineB3.setAttribute("stroke", "#7AF");
	lineB3.setAttribute("stroke-width", 128);
	lineB3.setAttribute("stroke-linecap","round");
	svg.appendChild(lineB3);
	const lineB4 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineB4.setAttribute("x1", pos[0]+500);
	lineB4.setAttribute("y1", pos[1]+400+1200);
	lineB4.setAttribute("x2", pos[0]+1500);
	lineB4.setAttribute("y2", pos[1]+400+1200);
	lineB4.setAttribute("stroke", "#15C");
	lineB4.setAttribute("stroke-width", 128);
	lineB4.setAttribute("stroke-linecap","round");
	svg.appendChild(lineB4);
	const lineE1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineE1.setAttribute("x1", pos[0]+500);
	lineE1.setAttribute("y1", pos[1]+400+2300);
	lineE1.setAttribute("x2", pos[0]+1500);
	lineE1.setAttribute("y2", pos[1]+400+2300);
	lineE1.setAttribute("stroke", "#166");
	lineE1.setAttribute("stroke-width", 128);
	lineE1.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE1);
	const lineE2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineE2.setAttribute("x1", pos[0]+500);
	lineE2.setAttribute("y1", pos[1]+400+3000);
	lineE2.setAttribute("x2", pos[0]+1500);
	lineE2.setAttribute("y2", pos[1]+400+3000);
	lineE2.setAttribute("stroke", "#A00");
	lineE2.setAttribute("stroke-width", 128);
	lineE2.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE2);
	const lineE3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineE3.setAttribute("x1", pos[0]+500);
	lineE3.setAttribute("y1", pos[1]+400+3700);
	lineE3.setAttribute("x2", pos[0]+1500);
	lineE3.setAttribute("y2", pos[1]+400+3700);
	lineE3.setAttribute("stroke", "#C90");
	lineE3.setAttribute("stroke-width", 128);
	lineE3.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE3);
	
	const textB1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
	textB1.setAttribute("font-size", 512);
	textB1.setAttribute("font-family", "bitter");
	textB1.setAttribute("x", pos[0]+2000);
	textB1.setAttribute("y", pos[1]+800);
	textB1.textContent = 'Base';
	const textB2 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textB2.setAttribute("x", pos[0]+2000);
	textB2.setAttribute("y", pos[1]+800+900);
	textB2.textContent = 'Extension';
	textB1.appendChild(textB2);
	const textOption = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textOption.setAttribute("x", pos[0]+2000);
	textOption.setAttribute("y", pos[1]+800+1600);
	textOption.textContent = 'Variations :';
	textB1.appendChild(textOption);
	const textE1 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE1.setAttribute("x", pos[0]+2000);
	textE1.setAttribute("y", pos[1]+800+2200);
	textE1.textContent = labels[0];
	textB1.appendChild(textE1);
	const textE2 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE2.setAttribute("x", pos[0]+2000);
	textE2.setAttribute("y", pos[1]+800+2900);
	textE2.textContent = labels[1];
	textB1.appendChild(textE2);
	const textE3 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE3.setAttribute("x", pos[0]+2000);
	textE3.setAttribute("y", pos[1]+800+3600);
	textE3.textContent = labels[2];
	textB1.appendChild(textE3);
	svg.appendChild(textB1);
}
