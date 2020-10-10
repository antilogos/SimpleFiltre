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
}

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
						nodeObject.x = value.x -shiftX + (Math.sin(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
						nodeObject.y = value.y -shiftY - (Math.cos(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
					} else {
						nodeObject.x = value.x -shiftX;
						nodeObject.y = value.y -shiftY;
					}
					nodeObject.id = node;
					// Store back the coordinates
					nodeMap[node] = nodeObject;
				}
			}
		}
	}
	return nodeMap;
}

function buildSvgNode(node) {
	const nodePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	nodePoint.setAttribute("cx", node.x);
	nodePoint.setAttribute("cy", node.y);
	
	if(nodeObject.isKeystone) {
		nodePoint.setAttribute("fill", "#F00");
		nodePoint.setAttribute("r", 128);
	} else if(nodeObject.isNotable) {
		nodePoint.setAttribute("fill", "#0F0");
		nodePoint.setAttribute("r", 64);
	} else if(nodeObject.isJewelSocket) {
		nodePoint.setAttribute("fill", "none");
		nodePoint.setAttribute("stroke", "#292");
		nodePoint.setAttribute("stroke-width", "8");
		nodePoint.setAttribute("r", 48);
	} else {
		nodePoint.setAttribute("fill", "#292");
		nodePoint.setAttribute("r", 32);
	}
	nodePoint.setAttribute("id", "node_"+node.id);
}