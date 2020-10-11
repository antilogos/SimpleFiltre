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
    let buffer = decodeBase64(u.split("/").pop().replace("-","+").replace("_","/"));
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
	  passiveNodes.push(view.getUint16(i));
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
		nodePoint.setAttribute("r", 128);
	} else if(node.isNotable) {
		nodePoint.setAttribute("fill", "#0F0");
		nodePoint.setAttribute("r", 64);
	} else if(node.isJewelSocket) {
		nodePoint.setAttribute("fill", "none");
		nodePoint.setAttribute("stroke", "#000");
		nodePoint.setAttribute("stroke-width", "8");
		nodePoint.setAttribute("r", 48);
	} else if(node.grantedStrength && node.grantedStrength == 10 && !node.grantedIntelligence && !node.grantedDexterity) {
		nodePoint.setAttribute("fill", "#800");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedDexterity && node.grantedDexterity == 10 && !node.grantedStrength && !node.grantedIntelligence) {
		nodePoint.setAttribute("fill", "#080");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedIntelligence && node.grantedIntelligence == 10 && !node.grantedStrength && !node.grantedDexterity) {
		nodePoint.setAttribute("fill", "#008");
		nodePoint.setAttribute("r", 32);
	} else {
		nodePoint.setAttribute("fill", "#888");
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
		nodeConnection.setAttribute("stroke-width", "12");
		return nodeConnection;
	// If not, draw line
	} else {
		const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "line");
		nodeConnection.setAttribute("x1", origin.x);
		nodeConnection.setAttribute("y1", origin.y);
		nodeConnection.setAttribute("x2", dest.x);
		nodeConnection.setAttribute("y2", dest.y);
		nodeConnection.setAttribute("style", "stroke:#000;stroke-width:12");
		return nodeConnection;
	}
};


function buildPath(nodeArray, style, svg, nodeMap, orbitMap, radiiMap) {
	// Draw array by getting all nodes and cheking their out
	for( let origin of Object.values(nodeArray)) {
		if(nodeMap[origin] && nodeMap[origin].out) {
			for( let dest of nodeMap[origin].out) {
				console.log("does",Object.values(nodeArray).map(v => JSON.stringify(v)),"includes",JSON.stringify(dest),Object.values(nodeArray).map(v => JSON.stringify(v)).includes(JSON.stringify(dest)));
				if(Object.values(nodeArray).map(v => JSON.stringify(v)).includes(JSON.stringify(dest))) {
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
						nodeConnection.setAttribute("stroke", style);
						nodeConnection.setAttribute("stroke-width", "24");
						svg.appendChild(nodeConnection);
					// If not, draw line
					} else {
						const nodeConnection = document.createElementNS("http://www.w3.org/2000/svg", "line");
						nodeConnection.setAttribute("x1", origin.x);
						nodeConnection.setAttribute("y1", origin.y);
						nodeConnection.setAttribute("x2", dest.x);
						nodeConnection.setAttribute("y2", dest.y);
						nodeConnection.setAttribute("style", "stroke:"+style+";stroke-width:8");
						svg.appendChild(nodeConnection);	
					}
				}
			}
		}
	}
};
