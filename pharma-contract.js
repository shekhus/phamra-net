'use strict';

const {Contract} = require('fabric-contract-api');

class PharmaContract extends Contract {

	constructor() {
		// Provide a custom name to refer to this smart contract
	    super('org.pharma-network.pharmanet');
	}

	/******** All custom functions are defined below ******/

	// This is a basic user defined function used at the time of instantiating the smart contract
	// To print the success message on console
	async instantiate(ctx) {
		console.log('Pharmanet Smart Contract Instantiated');
	}

	/**
	 *This transaction/function will be used to register new entities on the ledger
	 * Note - manufacturer/distributor/retailer/distributor has the access to this transaction
	 * @param ctx- The transaction context object
	 * @param companyCRN- A unique identification number alloted to all the registered companies
	 * @param companyName- Name of the company
	 * @param location- location of the company
	 * @param organisationRole - The roles allowed are Manufacturer, Distributor, Retailer, Transporter
	 * @returns newly created company object
	 */
	async registerCompany (ctx, companyCRN, companyName, location, organisationRole) {
	    let msgSender = ctx.clientIdentity.getMSPID();
	  	console.log(ctx.clientIdentity.getMSPID());
	  	if ((msgSender !== "manufacturerMSP") && (msgSender !== "distributorMSP") && (msgSender !== "retailerMSP") && (msgSender !== "transporterMSP")) {
		  	throw new Error('Not authorized.Only manufacturer/distributor/retailer/transporter can invoke this transaction');
	  	}
	  	const requestCompanyKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [companyCRN]);
	  	const companyIdKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [companyCRN+'-'+companyName]);
	  	let isCompanyBufferExisting =  await ctx.stub.getState(requestCompanyKey).catch(err => console.log(err));
	  	if (isCompanyBufferExisting.length !== 0) {
			throw new Error('Company Asset Already Exists in the network');
		}
		// Object to fetch the hierarchyKey based on organisationRole
		let getHierarchyKey = {
			Manufacturer: 1,
			Distributor: 2,
			Retailer: 3
		};
		let hierarchyKey = 0;
		// for loop to return hierarchyKey w.r.t specific organisationRole
		for (var k in getHierarchyKey) {
			if (k.toUpperCase() === organisationRole.toUpperCase()) {
			hierarchyKey = getHierarchyKey[k];
			break;
			}
		}
		let newCompanyObj = {
			companyID: companyIdKey,
			companyName: companyName,
			location: location,
			organisationRole: organisationRole,
			hierarchyKey: hierarchyKey,
			requestedBy: ctx.clientIdentity.getID(),
			createdAt: new Date(),
		};
		let newCompanyBuffer = Buffer.from(JSON.stringify(newCompanyObj));
		await ctx.stub.putState(requestCompanyKey, newCompanyBuffer);
		return newCompanyObj;
	}

	/**
	 * This transaction is used to register a new drug on the ledger by the ‘manufacturer’
	 * Note - only manufacturer has the access to this transaction
	 * @param ctx - The transaction context object
	 * @param drugName- Name of the drug
	 * @param serialNo -Unique serial no of the drug
	 * @param mfgDate -Manufacturing date of the drug
	 * @param expDate -Expiry date of the drug
	 * @param companyCRN -Unique CRN of manufacturer company
	 * @returns newly created drug object
	 */
	async addDrug(ctx, drugName, serialNo, mfgDate, expDate, companyCRN) {
		let msgSender = ctx.clientIdentity.getMSPID();
		if (msgSender !== "manufacturerMSP") {
			throw new Error("Not authorized. Only manufacturer can invoke this transaction");
		}
		const drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName+'-'+serialNo]);
		const manufacturerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [companyCRN]);
		let isManufacturerBufferExisting =  await ctx.stub.getState(manufacturerKey).catch(err => console.log(err));
		// validation : The registered manufacturer on the network is only allowed to access this transaction
		if (isManufacturerBufferExisting.length === 0) {
			throw new Error('Please register.Manufacturer Asset doesnt exist in the network');
		}
		let newDrugObj = {
			productID: drugKey,
			manufacturer: manufacturerKey,
			drugName: drugName,
			mfgDate: mfgDate,
			expDate: expDate,
			owner: manufacturerKey,
			shipment: [],
			addedBy: ctx.clientIdentity.getID(),
			transactionId: ctx.stub.getTxID(), 
			createdAt: new Date(),
			updatedAt: new Date()
			};
		let newDrugBuffer = Buffer.from(JSON.stringify(newDrugObj));
		await ctx.stub.putState(drugKey, newDrugBuffer);
		return newDrugObj;
	}

	/**
	 * This transaction is used to create Purchase Order to buy drugs by distributor or retailer
	 * Note Only distributor or retailer has the access to this transaction
	 * @param ctx - The transaction context object
	 * @param buyerCRN - Unique CRN of buyer company (distributor or retailer)
	 * @param sellerCRN - Unique CRN of seller company (manufacturer or distributor)
	 * @param drugName - Name of the drug
	 * @param quantity - No. of quantity of the drug for which the PO has to be created
	 * @returns newly created purchase order object
	 */
	async createPO (ctx, buyerCRN, sellerCRN, drugName, quantity) {
		let msgSender = ctx.clientIdentity.getMSPID();
		console.log(msgSender);
		if ((msgSender !== "distributorMSP") && (msgSender !== "retailerMSP")) {
			 throw new Error('Not authorized.Only distributor/retailer can invoke this transaction');
		}
		const purchaseOrderKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.purchaseOrder', [buyerCRN+'-'+drugName]);
		const buyerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [buyerCRN]);
		const sellerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [sellerCRN]);
		let isBuyerBufferExisting =  await ctx.stub.getState(buyerKey).catch(err => console.log(err));
		let buyerObj = JSON.parse(isBuyerBufferExisting.toString());
		let isSellerBufferExisting =  await ctx.stub.getState(sellerKey).catch(err => console.log(err));
		let sellerObj = JSON.parse(isSellerBufferExisting.toString());
			// validation : Making sure the purchase order hierarchy sequence(Manufacturer-> Distributor-> Retailer) is followed. If not followed an error message is prompted
			if (((buyerObj.hierarchyKey)-(sellerObj.hierarchyKey)) != 1) {
				throw new Error('PurchaseOrder Cancelled: The purchase sequence of hierarchy is violated');
			} else {
				let newPOObj = {
					poID: purchaseOrderKey,
					drugName: drugName,
					quantity: quantity,
					buyer: buyerKey,
				    seller: sellerKey,
					createdBy: ctx.clientIdentity.getID(),
					createdAt: new Date(),
				};
			let newPOBuffer = Buffer.from(JSON.stringify(newPOObj));
			await ctx.stub.putState(purchaseOrderKey, newPOBuffer);
			return newPOObj;
			}
	}

	/**
	 * The seller(manufacturer or distributor) invokes this transaction to transport the consignment via a transporter corresponding to each PO
	 * Note Only manufacturer or distributor has the access to this transaction
	 * @param ctx - The transaction context object
	 * @param buyerCRN - Unique CRN of buyer company (buyer can be distributor or retailer)
	 * @param drugName - Name of the drug
	 * @param listOfAssets - The list of drugs as mentioned in the PO
	 * @param transporterCRN - Unique CRN of the transporter company
	 * @returns newly created shipment object
	 */
	async createShipment (ctx, buyerCRN, drugName, listOfAssets, transporterCRN) {
		let msgSender = ctx.clientIdentity.getMSPID();
		if ((msgSender !== "distributorMSP") && (msgSender !== "manufacturerMSP")) {
			throw new Error('Not authorized.Only distributor/manufacturer can invoke this transaction');
		}
		// fetching the purchase Order
		const purchaseOrderKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.purchaseOrder', [buyerCRN+'-'+drugName]);
		let purchaseOrderBuffer= await ctx.stub.getState(purchaseOrderKey).catch(err => console.log(err));
		let purchaseOrderObject= JSON.parse(purchaseOrderBuffer.toString());
		//Note: fetching the transporter name , since transporter key is combination of name space transporterName and transporterCRN
		const companyKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [transporterCRN]);
		let companyBuffer =  await ctx.stub.getState(companyKey).catch(err => console.log(err));
		let companyObject = JSON.parse(companyBuffer.toString());
		let transporterName = companyObject.companyName;
		const transporterKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.shipmentOrder',[transporterName+'-'+transporterCRN]);
		const shipmentKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.shipmentOrder',[buyerCRN+'-'+drugName]);
		// checking for the existence of purchase Order and transporter on the ledger
		if (purchaseOrderBuffer.length === 0 && companyBuffer.length === 0) {
			throw new Error('Purchase Order or Transporter Asset doesnt exist in the network');
		};
		let assets = [];
		let listOfAssetsArray = listOfAssets.split(',');
		// validation1 : The length of ‘listOfAssets’ should be exactly equal to the quantity specified in the PO
		if (purchaseOrderObject.quantity != listOfAssetsArray.length) {
			throw new Error('shipment Rejected : The listOfAssets and the quantity in the PO doesnt match');
		}
		for (var i =0; i<listOfAssetsArray.length; i++) {
			let drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [listOfAssetsArray[i]]);
			console.log(drugKey);
			let drugBuffer = await ctx.stub.getState(drugKey).catch(err => console.log(err));
			//validation2 : The IDs of the Asset should be valid IDs which are registered on the network
			if (drugBuffer.length === 0) {
				throw new Error("Please register.The Drug Asset doesnt exist in the network");
			} else {
				let drugObject = JSON.parse(drugBuffer.toString());
				assets.push(drugKey);
				drugObject.owner = transporterKey; //updating the owner of the drug to transporter
				drugObject.updatedAt = new Date();
				let updatedDrugBuffer = Buffer.from(JSON.stringify(drugObject));
				await ctx.stub.putState(drugKey, updatedDrugBuffer);
			}
		}
		let newShipmentObj = {
		    shipmentID: shipmentKey,
			creator: purchaseOrderObject.seller, // The seller attribute of the purchaseOrder Asset will be the one who creates this shipment
			assests: assets,
			transporterCRN: transporterCRN,
			transporter: transporterKey,
			status: 'in-transit',
			createdBy: ctx.clientIdentity.getID(),
			createdAt: new Date(),
			updatedAt: new Date()
		};
		let newShipmentBuffer = Buffer.from(JSON.stringify(newShipmentObj));
		await ctx.stub.putState(shipmentKey, newShipmentBuffer);
		return newShipmentObj;
	}

	/**
	 * This transaction is used to update the status of the shipment to ‘Delivered’ when the consignment gets delivered to the destination
	 * Note Only transporter has the access to this transaction
	 * @param ctx - The transaction context object
	 * @param buyerCRN - Unique CRN of buyer company (buyer can be distributor or retailer)
	 * @param drugName -Name of the drug
	 * @param transporterCRN - Unique CRN of the transporter company
	 * @returns updated shipment object
	 */
	async updateShipment(ctx, buyerCRN, drugName, transporterCRN) {
		let msgSender = ctx.clientIdentity.getMSPID();
		if (msgSender !== "transporterMSP") {
			throw new Error('Not authorized.Only transporter can invoke this transaction');
		}
		const shipmentKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.shipmentOrder',[buyerCRN+'-'+drugName]);
		console.log(shipmentKey);
		let shipmentBuffer = await ctx.stub.getState(shipmentKey).catch(err => console.log('Shipment Asset doesnt exist in the network'));
		console.log(shipmentBuffer.length);
			// checking for the existence of shipment on the ledger
		if (shipmentBuffer.length === 0) {
			throw new Error('Shipment Asset doesnt exist in the network');
		}
		let shipmentObject = JSON.parse(shipmentBuffer.toString());
		console.log(shipmentObject);
		//Validation1 :This function should be invoked only by the transporter of the shipment
		if (shipmentObject.transporterCRN != transporterCRN) {
			throw new Error("Shipment cancelled. The present transporterCRN does not match with the transporterCRN of the shipment");
		}
		// updating the drug asset i.e shipment and owner attribute
		let assets = shipmentObject.assests;
		console.log(assets);
	    for (var k in assets) {
			console.log(assets[k]);
		    let drugBuffer = await ctx.stub.getState(assets[k]).catch(err => console.log(err));
		    let drugObject = JSON.parse(drugBuffer.toString());
			console.log(drugObject); //printing the drugobject before updation
		    if (drugObject) {
				const buyerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [buyerCRN]);
				drugObject.owner = buyerKey; //updating the owner to buyer
				drugObject.shipment.push(shipmentKey); //updating the shipment with shipmentkey
			    drugObject.updatedAt = new Date();
			    let updatedDrugBuffer = Buffer.from(JSON.stringify(drugObject));
				await ctx.stub.putState(assets[k], updatedDrugBuffer);
				console.log(drugObject); //printing the object after updation
			} else {
				throw new Error("The Drug Asset doesnt exist in the network");
			}
		}
		shipmentObject.status = 'delivered'; //updating the status of the shipment to delivered
		shipmentObject.updatedAt = new Date();
		let updatedShipmentBuffer = Buffer.from(JSON.stringify(shipmentObject));
		await ctx.stub.putState(shipmentKey, updatedShipmentBuffer);
		return shipmentObject;
	}

	/**
	 * This transaction is called by the retailer while selling the drug to a consumer
	 * Note Only retailer has the access to this transaction
	 * @param ctx - The transaction context object
	 * @param drugName -Name of the drug
	 * @param serialNo - Unique serial no of the drug
	 * @param retailerCRN - Unique CRN of the retailer company
	 * @param customerAadhar - Unique Aadhar identity of the customer
	 * @returns updated drug object i.e change in ownership from retailer to customerAadhar
	 */
	async retailDrug (ctx, drugName, serialNo, retailerCRN, customerAadhar) {
		let msgSender = ctx.clientIdentity.getMSPID();
		if (msgSender !== "retailerMSP") {
			throw new Error('Not authorized.Only retailer can invoke this transaction');
		}
		const retailerKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.company', [retailerCRN]);
		const drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName+'-'+serialNo]);
		let drugBuffer= await ctx.stub.getState(drugKey).catch(err => console.log(err));
		let drugObject= JSON.parse(drugBuffer.toString());
		   //validation1 : This transaction should be invoked only by the retailer, who is the owner of the drug
		if (drugObject.owner != retailerKey) {
			throw new Error('Not Authorized: The owner of the drug doesnt match with the retailer');
		}
		//Updating the owner to customerAadhar
		drugObject.owner = customerAadhar;
		drugObject.updatedAt = new Date();
		let updatedDrugBuffer = Buffer.from(JSON.stringify(drugObject));
		await ctx.stub.putState(drugKey, updatedDrugBuffer);
		return drugObject;
	}

	/**
	 * This transaction will be used to view the lifecycle of the product by fetching transactions from the blockchain
	 * @param ctx - The transaction context object
	 * @param drugName -Name of the drug
	 * @param serialNo - Unique serial no of the drug
	 * @returns transaction details history of the drug
	 */

	 
	async viewHistory (ctx, drugName, serialNo) {
		const drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName+'-'+serialNo]);
		let iterator = await ctx.stub.getHistoryForKey(drugKey).catch(err => console.log(err));
		let result = [];
		let res = await iterator.next();
		while (!res.done) {
			if (res.value) {
				let transactionId = res.value.tx_id; //fetches the every transactionId associated with the drug Asset
				let obj = JSON.parse(res.value.value.toString('utf8')); // fetches the drug object
				result.push({transactionId, obj});
			}
			res = await iterator.next();
		}
		await iterator.close();
		return result;
	}

	/**
	 * This transaction is used to view the current state of the Asset
	 * @param ctx - The transaction context object
	 * @param drugName -Name of the drug
	 * @param serialNo - Unique serial no of the drug
	 * @returns drug object
	 */
	async viewDrugCurrentState(ctx, drugName, serialNo) {
		const drugKey = ctx.stub.createCompositeKey('org.pharma-network.pharmanet.drug', [drugName+'-'+serialNo]);
		let drugBuffer= await ctx.stub.getState(drugKey).catch(err => console.log(err));
		let drugObject= JSON.parse(drugBuffer.toString());
		if (drugObject) {
			return drugObject;
		} else {
			throw new Error('Drug Asset doesnt exist on the ledger');
		}
	}

}

module.exports = PharmaContract;
