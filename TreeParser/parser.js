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
	
	// Get the passives nodes for the Ascendancy and Starting class
	for( let [key, value] of Object.entries(passiveSkillTreeData.nodes)) {
        	if(value.classStartIndex == characterClass) {
			passiveNodes.push(parseInt(key));
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
		// Ignore cluster jewels
		if(!value.isProxy) {
			// No orbit declaration in group
			for( let node of value.nodes) {
				const nodeObject = nodeMap[node];
				if(node in nodeMap) {
					if(nodeObject.orbit != 0) {
						// get the radius of the orbits from the groupNode
						const radius = passiveSkillTreeData.constants.orbitRadii[nodeObject.orbit];
						// Number of point on the circle
						const skillOrbit = passiveSkillTreeData.constants.skillsPerOrbit[nodeObject.orbit]; 
						// Place the node in the orbit and use orbit position to get him at the right location
						nodeObject.x = value.x + (Math.sin(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
						nodeObject.y = value.y - (Math.cos(Math.PI*2*nodeObject.orbitIndex/skillOrbit)*radius);
					} else {
						// node from group without coordinates?
						nodeObject.x = value.x;
						nodeObject.y = value.y;
						nodeObject.anomaly = true;
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
		nodePoint.setAttribute("fill", "#C00");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedDexterity && node.grantedDexterity == 10 && !node.grantedStrength && !node.grantedIntelligence) {
		nodePoint.setAttribute("fill", "#0C0");
		nodePoint.setAttribute("r", 32);
	} else if(node.grantedIntelligence && node.grantedIntelligence == 10 && !node.grantedStrength && !node.grantedDexterity) {
		nodePoint.setAttribute("fill", "#00C");
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
	lineE1.setAttribute("y1", pos[1]+400+2500);
	lineE1.setAttribute("x2", pos[0]+1500);
	lineE1.setAttribute("y2", pos[1]+400+2500);
	lineE1.setAttribute("stroke", "#166");
	lineE1.setAttribute("stroke-width", 128);
	lineE1.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE1);
	const lineE2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineE2.setAttribute("x1", pos[0]+500);
	lineE2.setAttribute("y1", pos[1]+400+3200);
	lineE2.setAttribute("x2", pos[0]+1500);
	lineE2.setAttribute("y2", pos[1]+400+3200);
	lineE2.setAttribute("stroke", "#A00");
	lineE2.setAttribute("stroke-width", 128);
	lineE2.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE2);
	const lineE3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	lineE3.setAttribute("x1", pos[0]+500);
	lineE3.setAttribute("y1", pos[1]+400+3900);
	lineE3.setAttribute("x2", pos[0]+1500);
	lineE3.setAttribute("y2", pos[1]+400+3900);
	lineE3.setAttribute("stroke", "#C90");
	lineE3.setAttribute("stroke-width", 128);
	lineE3.setAttribute("stroke-linecap","round");
	svg.appendChild(lineE3);
	
	const textB1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
	textB1.setAttribute("font-size", 512);
	textB1.setAttribute("font-family", "bitter");
	textB1.setAttribute("x", pos[0]+2000);
	textB1.setAttribute("y", pos[1]+600);
	textB1.textContent = 'Base';
	const textB2 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textB2.setAttribute("x", pos[0]+2000);
	textB2.setAttribute("y", pos[1]+600+900);
	textB2.textContent = 'Extension';
	textB1.appendChild(textB2);
	const textOption = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textOption.setAttribute("x", pos[0]+2000);
	textOption.setAttribute("y", pos[1]+600+1600);
	textOption.textContent = 'Variations :';
	textB1.appendChild(textOption);
	const textE1 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE1.setAttribute("x", pos[0]+2000);
	textE1.setAttribute("y", pos[1]+600+2400);
	textE1.textContent = labels[0];
	textB1.appendChild(textE1);
	const textE2 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE2.setAttribute("x", pos[0]+2000);
	textE2.setAttribute("y", pos[1]+600+3100);
	textE2.textContent = labels[1];
	textB1.appendChild(textE2);
	const textE3 = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
	textE3.setAttribute("x", pos[0]+2000);
	textE3.setAttribute("y", pos[1]+600+3800);
	textE3.textContent = labels[2];
	textB1.appendChild(textE3);
	svg.appendChild(textB1);
};

function buildClassIcon(node, svg) {
	let imageUrl = "https://pathofexile.com/image/gen/inventory-sprite.png";
	let classPosition = [{x:658,y:80},{x:320,y:580},{x:330,y:340},{x:658,y:480},{x:320,y:500},{x:658,y:160},{x:658,y:400}];
	let imageSize = {x:76,y:80};
	let zoom = 10;
	let offsetClipX = classPosition[node.classStartIndex-1].x + node.x/zoom;
	let offsetClipY = classPosition[node.classStartIndex-1].y + node.y/zoom;
	const clipPath = document.createElementNS("http://www.w3.org/2000/svg","clipPath");
	clipPath.setAttribute("id","clipper");
	const rectClip = document.createElementNS("http://www.w3.org/2000/svg","rect");
	rectClip.setAttribute("x", offsetClipX);
	rectClip.setAttribute("y", offsetClipY);
	rectClip.setAttribute("width", imageSize.x);
	rectClip.setAttribute("height", imageSize.y);
	clipPath.appendChild(rectClip);
	svg.appendChild(clipPath);
	const gPanel = document.createElementNS("http://www.w3.org/2000/svg","g");
	gPanel.setAttribute("transform","scale("+zoom+") translate("+(-1*classPosition[node.classStartIndex-1].x-imageSize.x/2)+","+(-1*classPosition[node.classStartIndex-1].y-imageSize.y/2)+")");
	const img = document.createElementNS("http://www.w3.org/2000/svg","image");
	img.setAttribute("x", node.x/zoom);
	img.setAttribute("y", node.y/zoom);
	img.setAttribute("width", 788);
	img.setAttribute("height", 710);
	img.setAttribute("href",imageUrl);
	img.setAttribute("xlink:href",imageUrl);
	img.setAttribute("clip-path","url(#clipper)");
	gPanel.appendChild(img);
	svg.appendChild(gPanel);
};


function buildMasteryIcon(svg) {
	let imageUrl = "mastery-active-selected-3.png";
	let imageSize = {x:104,y:99};
	let zoom = 10;
	let masteryPosition = [{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryMineActive.png", x:imageSize.x*19,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryLightningActive.png", x:imageSize.x*13,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryLifeActive.png", x:imageSize.x*12,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryEnergyActive.png", x:imageSize.x*7,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryPoisonActive.png", x:imageSize.x*3,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryEvasionAndEnergyShieldActive.png", x:imageSize.x*18,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryDamageOverTimeActive.png", x:imageSize.x*9,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryEvasionActive.png", x:imageSize.x*18,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryAxeActive.png", x:imageSize.x*2,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryAttributesActive.png", x:imageSize.x*21,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryChargesActive.png", x:imageSize.x*15,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryClawsActive.png", x:imageSize.x*5,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryStaffActive.png", x:imageSize.x*3,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryElementalActive.png", x:imageSize.x*0,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryProjectileActive.png", x:imageSize.x*6,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryLeechActive.png", x:imageSize.x*19,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryBowActive.png", x:imageSize.x*20,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryReservationActive.png", x:imageSize.x*17,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryCurseActive.png", x:imageSize.x*5,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryTwoHandActive.png", x:imageSize.x*4,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryColdActive.png", x:imageSize.x*18,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryDaggerActive.png", x:imageSize.x*0,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryWarcryActive.png", x:imageSize.x*20,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryAttackActive.png", x:imageSize.x*23,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryManaActive.png", x:imageSize.x*11,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryDualWieldActive.png", x:imageSize.x*0,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryMinionDefenseActive.png", x:imageSize.y*3,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryFlaskActive.png", x:imageSize.x*12,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryCriticalActive.png", x:imageSize.x*10,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasterySwordActive.png", x:imageSize.x*1,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryTrapActive.png", x:imageSize.x*1,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryFireActive.png", x:imageSize.x*16,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryMaceActive.png", x:imageSize.x*4,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryPhysicalActive.png", x:imageSize.x*15,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryResistancesAndAilmentProtectionActive.png", x:imageSize.x*6,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryCasterActive.png", x:imageSize.x*14,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryMinionOffenseActive.png", x:imageSize.x*5,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryShieldActive.png", x:imageSize.x*6,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryArmourAndEvasionActive.png", x:imageSize.x*17,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasterySpellSuppressionActive.png", x:imageSize.x*2,y:imageSize.y*2},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryBrandActive.png", x:imageSize.x*18,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryBlockActive.png", x:imageSize.x*22,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryChaosActive.png", x:imageSize.x*11,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryLinkActive.png", x:imageSize.x*2,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryAccuracyActive.png", x:imageSize.x*7,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryTotemActive.png", x:imageSize.x*9,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryDurationActive.png", x:imageSize.x*16,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryArmourAndEnergyShieldActive.png", x:imageSize.x*14,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryWandActive.png", x:imageSize.y*8,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryBleedingActive.png", x:imageSize.x*7,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryArmourActive.png", x:imageSize.x*13,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryImpaleActive.png", x:imageSize.x*8,y:imageSize.y*0},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryFortifyActive.png", x:imageSize.x*1,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryMarkActive.png", x:imageSize.x*22,y:imageSize.y*1},
	{mastery:"Art/2DArt/SkillIcons/passives/MasteryPassiveIcons/PassiveMasteryBlindActive.png", x:imageSize.x*21,y:imageSize.y*1}];
	
	
	for( let[key, value] of Object.entries(passiveSkillTreeData.nodes)) {
		if(value.isMastery && value.group) {
			const group = passiveSkillTreeData.groups[value.group];			
			const masteryImg = masteryPosition.find(m => m.mastery == value.activeIcon);
			let offsetClipX = masteryImg.x + group.x/zoom;
			let offsetClipY = masteryImg.y + group.y/zoom
			const clipper = "url(#clipper" + key + ")"
			
			const clipPath = document.createElementNS("http://www.w3.org/2000/svg","clipPath");
			clipPath.setAttribute("id","clipper" + key);
			const rectClip = document.createElementNS("http://www.w3.org/2000/svg","rect");
			rectClip.setAttribute("x", offsetClipX);
			rectClip.setAttribute("y", offsetClipY);
			rectClip.setAttribute("width", imageSize.x);
			rectClip.setAttribute("height", imageSize.y);
			clipPath.appendChild(rectClip);
			svg.appendChild(clipPath);
			const gPanel = document.createElementNS("http://www.w3.org/2000/svg","g");
			gPanel.setAttribute("transform","scale("+zoom+") translate("+(-1*masteryImg.x-imageSize.x/2)+","+(-1*masteryImg.y-imageSize.y/2)+")");
			const img = document.createElementNS("http://www.w3.org/2000/svg","image");
			img.setAttribute("x", group.x/zoom);
			img.setAttribute("y", group.y/zoom);
			img.setAttribute("width", 2408);
			img.setAttribute("height", 297);
			img.setAttribute("href",imageUrl);
			img.setAttribute("xlink:href",imageUrl);
			img.setAttribute("clip-path",clipper);
			gPanel.appendChild(img);
			svg.appendChild(gPanel);
		}
	}
};


