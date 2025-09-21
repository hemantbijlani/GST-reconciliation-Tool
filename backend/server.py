from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import pandas as pd
import json
from io import BytesIO
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="GST Reconciliation API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class GSTRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    gstin: str
    invoice_number: str
    invoice_date: str
    invoice_amount: float
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    total_tax: float = 0.0
    vendor_name: Optional[str] = None
    record_type: str  # "2B" or "BOOKS"
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GSTRecordCreate(BaseModel):
    gstin: str
    invoice_number: str
    invoice_date: str
    invoice_amount: float
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    vendor_name: Optional[str] = None

class ReconciliationMatch(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    gstin: str
    invoice_number: str
    books_record_id: Optional[str] = None
    twob_record_id: Optional[str] = None
    match_status: str  # "MATCHED", "UNMATCHED_2B", "UNMATCHED_BOOKS", "AMOUNT_MISMATCH", "TAX_MISMATCH"
    invoice_amount_diff: float = 0.0
    cgst_diff: float = 0.0
    sgst_diff: float = 0.0
    igst_diff: float = 0.0
    total_tax_diff: float = 0.0
    reconciled_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReconciliationSummary(BaseModel):
    total_books_records: int
    total_2b_records: int
    matched_records: int
    unmatched_books_records: int
    unmatched_2b_records: int
    amount_mismatches: int
    tax_mismatches: int
    total_amount_difference: float
    total_tax_difference: float

# Helper functions
def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.isoformat()
    return data

def parse_from_mongo(item):
    """Parse datetime strings back from MongoDB"""
    if isinstance(item, dict):
        for key, value in item.items():
            if key in ['uploaded_at', 'reconciled_at'] and isinstance(value, str):
                try:
                    item[key] = datetime.fromisoformat(value)
                except:
                    pass
    return item

def process_excel_data(file_content: bytes, record_type: str) -> List[Dict]:
    """Process Excel/CSV file and convert to GST records"""
    try:
        # Try reading as Excel first
        df = pd.read_excel(BytesIO(file_content))
    except:
        try:
            # Try reading as CSV
            df = pd.read_csv(BytesIO(file_content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Standardize column names (case insensitive mapping)
    column_mapping = {
        'gstin': ['gstin', 'gst_number', 'gst_no', 'vendor_gstin'],
        'invoice_number': ['invoice_number', 'invoice_no', 'inv_no', 'bill_no', 'invoice number'],
        'invoice_date': ['invoice_date', 'inv_date', 'bill_date', 'date', 'invoice date'],
        'invoice_amount': ['invoice_amount', 'inv_amount', 'bill_amount', 'amount', 'total_amount', 'invoice amount'],
        'cgst': ['cgst', 'cgst_amount'],
        'sgst': ['sgst', 'sgst_amount'],
        'igst': ['igst', 'igst_amount'],
        'vendor_name': ['vendor_name', 'supplier_name', 'party_name', 'vendor', 'vendor name']
    }
    
    # Create a mapping of actual columns to standard columns
    actual_columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
    standard_mapping = {}
    
    for standard_col, possible_names in column_mapping.items():
        for possible_name in possible_names:
            normalized_possible = possible_name.lower().strip().replace(' ', '_')
            matching_mask = actual_columns == normalized_possible
            if matching_mask.any():
                original_col = df.columns[matching_mask].tolist()[0]
                standard_mapping[original_col] = standard_col
                break
    
    # Rename columns
    df = df.rename(columns=standard_mapping)
    
    # Validate required columns
    required_cols = ['gstin', 'invoice_number', 'invoice_date', 'invoice_amount']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400, 
            detail=f"Missing required columns: {missing_cols}. Available columns: {list(df.columns)}"
        )
    
    # Convert data types and prepare records
    records = []
    for _, row in df.iterrows():
        try:
            # Calculate total tax
            cgst = float(row.get('cgst', 0) or 0)
            sgst = float(row.get('sgst', 0) or 0)
            igst = float(row.get('igst', 0) or 0)
            total_tax = cgst + sgst + igst
            
            record = {
                'gstin': str(row['gstin']).strip(),
                'invoice_number': str(row['invoice_number']).strip(),
                'invoice_date': str(row['invoice_date']),
                'invoice_amount': float(row['invoice_amount']),
                'cgst': cgst,
                'sgst': sgst,
                'igst': igst,
                'total_tax': total_tax,
                'vendor_name': str(row.get('vendor_name', '')).strip() if pd.notna(row.get('vendor_name')) else None,
                'record_type': record_type
            }
            records.append(record)
        except Exception as e:
            continue  # Skip invalid rows
    
    return records

async def perform_reconciliation():
    """Perform GST reconciliation between 2B and Books data"""
    # Clear previous reconciliation results
    await db.reconciliation_matches.delete_many({})
    
    # Get all records
    books_records = await db.gst_records.find({"record_type": "BOOKS"}).to_list(length=None)
    twob_records = await db.gst_records.find({"record_type": "2B"}).to_list(length=None)
    
    # Create dictionaries for faster lookup
    books_dict = {}
    for record in books_records:
        key = f"{record['gstin']}_{record['invoice_number']}"
        books_dict[key] = record
    
    twob_dict = {}
    for record in twob_records:
        key = f"{record['gstin']}_{record['invoice_number']}"
        twob_dict[key] = record
    
    matches = []
    processed_books = set()
    processed_2b = set()
    
    # Find matches and mismatches
    for books_key, books_record in books_dict.items():
        if books_key in twob_dict:
            twob_record = twob_dict[books_key]
            processed_books.add(books_key)
            processed_2b.add(books_key)
            
            # Calculate differences
            invoice_diff = books_record['invoice_amount'] - twob_record['invoice_amount']
            cgst_diff = books_record.get('cgst', 0) - twob_record.get('cgst', 0)
            sgst_diff = books_record.get('sgst', 0) - twob_record.get('sgst', 0)
            igst_diff = books_record.get('igst', 0) - twob_record.get('igst', 0)
            total_tax_diff = books_record.get('total_tax', 0) - twob_record.get('total_tax', 0)
            
            # Determine match status
            if abs(invoice_diff) > 0.01:  # Allow for small rounding differences
                status = "AMOUNT_MISMATCH"
            elif abs(total_tax_diff) > 0.01:
                status = "TAX_MISMATCH"
            else:
                status = "MATCHED"
            
            match = ReconciliationMatch(
                gstin=books_record['gstin'],
                invoice_number=books_record['invoice_number'],
                books_record_id=books_record['id'],
                twob_record_id=twob_record['id'],
                match_status=status,
                invoice_amount_diff=invoice_diff,
                cgst_diff=cgst_diff,
                sgst_diff=sgst_diff,
                igst_diff=igst_diff,
                total_tax_diff=total_tax_diff
            )
            matches.append(match)
    
    # Add unmatched books records
    for books_key, books_record in books_dict.items():
        if books_key not in processed_books:
            match = ReconciliationMatch(
                gstin=books_record['gstin'],
                invoice_number=books_record['invoice_number'],
                books_record_id=books_record['id'],
                match_status="UNMATCHED_BOOKS"
            )
            matches.append(match)
    
    # Add unmatched 2B records
    for twob_key, twob_record in twob_dict.items():
        if twob_key not in processed_2b:
            match = ReconciliationMatch(
                gstin=twob_record['gstin'],
                invoice_number=twob_record['invoice_number'],
                twob_record_id=twob_record['id'],
                match_status="UNMATCHED_2B"
            )
            matches.append(match)
    
    # Save matches to database
    if matches:
        match_dicts = [prepare_for_mongo(match.dict()) for match in matches]
        await db.reconciliation_matches.insert_many(match_dicts)
    
    return len(matches)

# API Routes
@api_router.get("/")
async def root():
    return {"message": "GST Reconciliation API"}

@api_router.post("/upload/{record_type}")
async def upload_gst_data(record_type: str, file: UploadFile = File(...)):
    """Upload GST data (2B or BOOKS) via Excel/CSV file"""
    if record_type not in ["2B", "BOOKS"]:
        raise HTTPException(status_code=400, detail="record_type must be '2B' or 'BOOKS'")
    
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="File must be Excel (.xlsx, .xls) or CSV (.csv)")
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Process file data
        records_data = process_excel_data(file_content, record_type)
        
        if not records_data:
            raise HTTPException(status_code=400, detail="No valid records found in file")
        
        # Clear existing records of this type
        await db.gst_records.delete_many({"record_type": record_type})
        
        # Create GST records and save to database
        gst_records = [GSTRecord(**record_data) for record_data in records_data]
        record_dicts = [prepare_for_mongo(record.dict()) for record in gst_records]
        
        result = await db.gst_records.insert_many(record_dicts)
        
        return {
            "message": f"Successfully uploaded {len(result.inserted_ids)} {record_type} records",
            "count": len(result.inserted_ids)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.post("/records/{record_type}", response_model=GSTRecord)
async def create_gst_record(record_type: str, record: GSTRecordCreate):
    """Create a single GST record manually"""
    if record_type not in ["2B", "BOOKS"]:
        raise HTTPException(status_code=400, detail="record_type must be '2B' or 'BOOKS'")
    
    # Calculate total tax
    total_tax = record.cgst + record.sgst + record.igst
    
    # Create record dict and update with additional fields
    record_data = record.dict()
    record_data['total_tax'] = total_tax
    record_data['record_type'] = record_type  # Use the path parameter
    
    gst_record = GSTRecord(**record_data)
    
    record_dict = prepare_for_mongo(gst_record.dict())
    await db.gst_records.insert_one(record_dict)
    
    return gst_record

@api_router.get("/records/{record_type}", response_model=List[GSTRecord])
async def get_gst_records(record_type: str):
    """Get all GST records of a specific type"""
    if record_type not in ["2B", "BOOKS", "ALL"]:
        raise HTTPException(status_code=400, detail="record_type must be '2B', 'BOOKS', or 'ALL'")
    
    if record_type == "ALL":
        records = await db.gst_records.find().to_list(length=None)
    else:
        records = await db.gst_records.find({"record_type": record_type}).to_list(length=None)
    
    return [GSTRecord(**parse_from_mongo(record)) for record in records]

@api_router.post("/reconcile")
async def reconcile_data():
    """Perform reconciliation between 2B and Books data"""
    try:
        matches_count = await perform_reconciliation()
        return {
            "message": "Reconciliation completed successfully",
            "matches_processed": matches_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during reconciliation: {str(e)}")

@api_router.get("/reconciliation/summary", response_model=ReconciliationSummary)
async def get_reconciliation_summary():
    """Get reconciliation summary statistics"""
    books_count = await db.gst_records.count_documents({"record_type": "BOOKS"})
    twob_count = await db.gst_records.count_documents({"record_type": "2B"})
    
    matched_count = await db.reconciliation_matches.count_documents({"match_status": "MATCHED"})
    unmatched_books = await db.reconciliation_matches.count_documents({"match_status": "UNMATCHED_BOOKS"})
    unmatched_2b = await db.reconciliation_matches.count_documents({"match_status": "UNMATCHED_2B"})
    amount_mismatches = await db.reconciliation_matches.count_documents({"match_status": "AMOUNT_MISMATCH"})
    tax_mismatches = await db.reconciliation_matches.count_documents({"match_status": "TAX_MISMATCH"})
    
    # Calculate total differences
    pipeline = [
        {"$group": {
            "_id": None,
            "total_amount_diff": {"$sum": {"$abs": "$invoice_amount_diff"}},
            "total_tax_diff": {"$sum": {"$abs": "$total_tax_diff"}}
        }}
    ]
    
    result = await db.reconciliation_matches.aggregate(pipeline).to_list(1)
    total_amount_diff = result[0]["total_amount_diff"] if result else 0
    total_tax_diff = result[0]["total_tax_diff"] if result else 0
    
    return ReconciliationSummary(
        total_books_records=books_count,
        total_2b_records=twob_count,
        matched_records=matched_count,
        unmatched_books_records=unmatched_books,
        unmatched_2b_records=unmatched_2b,
        amount_mismatches=amount_mismatches,
        tax_mismatches=tax_mismatches,
        total_amount_difference=total_amount_diff,
        total_tax_difference=total_tax_diff
    )

@api_router.get("/reconciliation/matches", response_model=List[ReconciliationMatch])
async def get_reconciliation_matches(status: Optional[str] = None):
    """Get reconciliation matches with optional status filter"""
    if status:
        matches = await db.reconciliation_matches.find({"match_status": status}).to_list(length=None)
    else:
        matches = await db.reconciliation_matches.find().to_list(length=None)
    
    return [ReconciliationMatch(**parse_from_mongo(match)) for match in matches]

@api_router.get("/reconciliation/export")
async def export_reconciliation_results():
    """Export reconciliation results to Excel"""
    try:
        # Get all matches with detailed data
        matches = await db.reconciliation_matches.find().to_list(length=None)
        
        if not matches:
            raise HTTPException(status_code=404, detail="No reconciliation results found")
        
        # Prepare data for export
        export_data = []
        for match in matches:
            books_record = None
            twob_record = None
            
            if match.get('books_record_id'):
                books_record = await db.gst_records.find_one({"id": match['books_record_id']})
            if match.get('twob_record_id'):
                twob_record = await db.gst_records.find_one({"id": match['twob_record_id']})
            
            row = {
                'GSTIN': match['gstin'],
                'Invoice Number': match['invoice_number'],
                'Match Status': match['match_status'],
                'Books Amount': books_record['invoice_amount'] if books_record else 0,
                '2B Amount': twob_record['invoice_amount'] if twob_record else 0,
                'Amount Difference': match.get('invoice_amount_diff', 0),
                'Books CGST': books_record.get('cgst', 0) if books_record else 0,
                '2B CGST': twob_record.get('cgst', 0) if twob_record else 0,
                'CGST Difference': match.get('cgst_diff', 0),
                'Books SGST': books_record.get('sgst', 0) if books_record else 0,
                '2B SGST': twob_record.get('sgst', 0) if twob_record else 0,
                'SGST Difference': match.get('sgst_diff', 0),
                'Books IGST': books_record.get('igst', 0) if books_record else 0,
                '2B IGST': twob_record.get('igst', 0) if twob_record else 0,
                'IGST Difference': match.get('igst_diff', 0),
                'Total Tax Difference': match.get('total_tax_diff', 0)
            }
            export_data.append(row)
        
        # Create Excel file
        df = pd.DataFrame(export_data)
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            df.to_excel(tmp_file.name, index=False)
            tmp_file_path = tmp_file.name
        
        return FileResponse(
            tmp_file_path,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename=f'gst_reconciliation_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting data: {str(e)}")

@api_router.delete("/records/{record_type}")
async def clear_records(record_type: str):
    """Clear all records of a specific type"""
    if record_type not in ["2B", "BOOKS", "ALL"]:
        raise HTTPException(status_code=400, detail="record_type must be '2B', 'BOOKS', or 'ALL'")
    
    if record_type == "ALL":
        result = await db.gst_records.delete_many({})
        await db.reconciliation_matches.delete_many({})
    else:
        result = await db.gst_records.delete_many({"record_type": record_type})
    
    return {"message": f"Deleted {result.deleted_count} records"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()