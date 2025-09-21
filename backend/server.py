from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import pandas as pd
import json
from io import BytesIO
import tempfile
import traceback

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(
    title="GST Reconciliation API",
    description="Professional GST Reconciliation System for 2B vs Books data analysis",
    version="1.0.0"
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models with enhanced validation
class GSTRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    gstin: str = Field(..., min_length=15, max_length=15, description="GSTIN must be exactly 15 characters")
    invoice_number: str = Field(..., min_length=1, max_length=50, description="Invoice number is required")
    invoice_date: str = Field(..., description="Invoice date in YYYY-MM-DD format")
    invoice_amount: float = Field(..., gt=0, description="Invoice amount must be greater than 0")
    cgst: float = Field(default=0.0, ge=0, description="CGST amount must be non-negative")
    sgst: float = Field(default=0.0, ge=0, description="SGST amount must be non-negative")
    igst: float = Field(default=0.0, ge=0, description="IGST amount must be non-negative")
    total_tax: float = Field(default=0.0, ge=0)
    vendor_name: Optional[str] = Field(None, max_length=200)
    record_type: str = Field(..., description="Must be either '2B' or 'BOOKS'")
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @validator('gstin')
    def validate_gstin(cls, v):
        if not v or len(v.strip()) != 15:
            raise ValueError('GSTIN must be exactly 15 characters long')
        return v.strip().upper()

    @validator('record_type')
    def validate_record_type(cls, v):
        if v not in ['2B', 'BOOKS']:
            raise ValueError('Record type must be either "2B" or "BOOKS"')
        return v

    @validator('invoice_date')
    def validate_invoice_date(cls, v):
        try:
            datetime.strptime(v, '%Y-%m-%d')
            return v
        except ValueError:
            raise ValueError('Invoice date must be in YYYY-MM-DD format')

class GSTRecordCreate(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15)
    invoice_number: str = Field(..., min_length=1, max_length=50)
    invoice_date: str = Field(...)
    invoice_amount: float = Field(..., gt=0)
    cgst: float = Field(default=0.0, ge=0)
    sgst: float = Field(default=0.0, ge=0)
    igst: float = Field(default=0.0, ge=0)
    vendor_name: Optional[str] = Field(None, max_length=200)
    record_type: str

    @validator('gstin')
    def validate_gstin(cls, v):
        if not v or len(v.strip()) != 15:
            raise ValueError('GSTIN must be exactly 15 characters long')
        return v.strip().upper()

    @validator('record_type')
    def validate_record_type(cls, v):
        if v not in ['2B', 'BOOKS']:
            raise ValueError('Record type must be either "2B" or "BOOKS"')
        return v

    @validator('invoice_date')
    def validate_invoice_date(cls, v):
        try:
            datetime.strptime(v, '%Y-%m-%d')
            return v
        except ValueError:
            raise ValueError('Invoice date must be in YYYY-MM-DD format')

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

class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[Dict] = None

# Enhanced helper functions
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

def validate_file_type(filename: str) -> bool:
    """Validate if file type is supported"""
    supported_extensions = ['.xlsx', '.xls', '.csv']
    return any(filename.lower().endswith(ext) for ext in supported_extensions)

def process_excel_data(file_content: bytes, record_type: str) -> List[Dict]:
    """Process Excel/CSV file and convert to GST records with enhanced error handling"""
    try:
        # Try reading as Excel first
        try:
            df = pd.read_excel(BytesIO(file_content))
        except Exception as excel_error:
            try:
                # Try reading as CSV with different encodings
                df = pd.read_csv(BytesIO(file_content), encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(BytesIO(file_content), encoding='latin1')
            except Exception as csv_error:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unable to read file. Excel error: {str(excel_error)[:100]}. CSV error: {str(csv_error)[:100]}"
                )
    
        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")
        
        # Standardize column names (case insensitive mapping)
        column_mapping = {
            'gstin': ['gstin', 'gst_number', 'gst_no', 'vendor_gstin', 'gst in', 'gst number'],
            'invoice_number': ['invoice_number', 'invoice_no', 'inv_no', 'bill_no', 'invoice number', 'invoice no'],
            'invoice_date': ['invoice_date', 'inv_date', 'bill_date', 'date', 'invoice date'],
            'invoice_amount': ['invoice_amount', 'inv_amount', 'bill_amount', 'amount', 'total_amount', 'invoice amount', 'total amount'],
            'cgst': ['cgst', 'cgst_amount', 'cgst amount'],
            'sgst': ['sgst', 'sgst_amount', 'sgst amount'],
            'igst': ['igst', 'igst_amount', 'igst amount'],
            'vendor_name': ['vendor_name', 'supplier_name', 'party_name', 'vendor', 'vendor name', 'supplier name']
        }
        
        # Create a mapping of actual columns to standard columns
        actual_columns = df.columns.str.lower().str.strip().str.replace(' ', '_').str.replace('__', '_')
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
            available_cols = list(df.columns)
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": "Missing required columns",
                    "missing_columns": missing_cols,
                    "available_columns": available_cols,
                    "required_columns": required_cols,
                    "suggestion": "Please ensure your file contains columns for GSTIN, Invoice Number, Invoice Date, and Invoice Amount"
                }
            )
        
        # Convert data types and prepare records
        records = []
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Validate and clean GSTIN
                gstin = str(row['gstin']).strip().upper()
                if len(gstin) != 15:
                    errors.append(f"Row {index + 2}: GSTIN '{gstin}' must be exactly 15 characters")
                    continue
                
                # Validate invoice number
                invoice_number = str(row['invoice_number']).strip()
                if not invoice_number or invoice_number == 'nan':
                    errors.append(f"Row {index + 2}: Invoice number is required")
                    continue
                
                # Validate and parse amounts
                try:
                    invoice_amount = float(row['invoice_amount'])
                    if invoice_amount <= 0:
                        errors.append(f"Row {index + 2}: Invoice amount must be greater than 0")
                        continue
                except (ValueError, TypeError):
                    errors.append(f"Row {index + 2}: Invalid invoice amount '{row['invoice_amount']}'")
                    continue
                
                # Parse tax amounts with error handling
                cgst = 0.0
                sgst = 0.0
                igst = 0.0
                
                try:
                    cgst = float(row.get('cgst', 0) or 0)
                except (ValueError, TypeError):
                    cgst = 0.0
                
                try:
                    sgst = float(row.get('sgst', 0) or 0)
                except (ValueError, TypeError):
                    sgst = 0.0
                
                try:
                    igst = float(row.get('igst', 0) or 0)
                except (ValueError, TypeError):
                    igst = 0.0
                
                total_tax = cgst + sgst + igst
                
                # Parse date
                invoice_date = str(row['invoice_date'])
                try:
                    # Try to parse various date formats
                    if 'T' in invoice_date:
                        parsed_date = datetime.fromisoformat(invoice_date.split('T')[0])
                    else:
                        parsed_date = pd.to_datetime(invoice_date).date()
                    invoice_date = parsed_date.strftime('%Y-%m-%d')
                except:
                    errors.append(f"Row {index + 2}: Invalid date format '{invoice_date}'")
                    continue
                
                record = {
                    'gstin': gstin,
                    'invoice_number': invoice_number,
                    'invoice_date': invoice_date,
                    'invoice_amount': invoice_amount,
                    'cgst': cgst,
                    'sgst': sgst,
                    'igst': igst,
                    'total_tax': total_tax,
                    'vendor_name': str(row.get('vendor_name', '')).strip() if pd.notna(row.get('vendor_name')) else None,
                    'record_type': record_type
                }
                records.append(record)
                
            except Exception as e:
                errors.append(f"Row {index + 2}: Unexpected error - {str(e)}")
                continue
        
        if not records and errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No valid records found in file",
                    "validation_errors": errors[:10],  # Show first 10 errors
                    "total_errors": len(errors)
                }
            )
        
        # Return results with warnings if some rows failed
        result = {"records": records}
        if errors:
            result["warnings"] = {
                "processed_rows": len(records),
                "failed_rows": len(errors),
                "errors": errors[:5]  # Show first 5 errors as warnings
            }
        
        return records
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error in process_excel_data: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error processing file: {str(e)[:200]}"
        )

async def perform_reconciliation():
    """Perform GST reconciliation between 2B and Books data with enhanced error handling"""
    try:
        # Clear previous reconciliation results
        await db.reconciliation_matches.delete_many({})
        
        # Get all records with error handling
        try:
            books_records = await db.gst_records.find({"record_type": "BOOKS"}).to_list(length=None)
            twob_records = await db.gst_records.find({"record_type": "2B"}).to_list(length=None)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error retrieving records from database: {str(e)}")
        
        if not books_records and not twob_records:
            raise HTTPException(status_code=400, detail="No records found for reconciliation. Please upload data first.")
        
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
                
                # Calculate differences with proper error handling
                try:
                    invoice_diff = float(books_record.get('invoice_amount', 0)) - float(twob_record.get('invoice_amount', 0))
                    cgst_diff = float(books_record.get('cgst', 0)) - float(twob_record.get('cgst', 0))
                    sgst_diff = float(books_record.get('sgst', 0)) - float(twob_record.get('sgst', 0))
                    igst_diff = float(books_record.get('igst', 0)) - float(twob_record.get('igst', 0))
                    total_tax_diff = float(books_record.get('total_tax', 0)) - float(twob_record.get('total_tax', 0))
                except (ValueError, TypeError) as e:
                    logging.warning(f"Error calculating differences for {books_key}: {str(e)}")
                    invoice_diff = cgst_diff = sgst_diff = igst_diff = total_tax_diff = 0.0
                
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
                    invoice_amount_diff=round(invoice_diff, 2),
                    cgst_diff=round(cgst_diff, 2),
                    sgst_diff=round(sgst_diff, 2),
                    igst_diff=round(igst_diff, 2),
                    total_tax_diff=round(total_tax_diff, 2)
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
            try:
                match_dicts = [prepare_for_mongo(match.dict()) for match in matches]
                await db.reconciliation_matches.insert_many(match_dicts)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error saving reconciliation results: {str(e)}")
        
        return len(matches)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error in perform_reconciliation: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {str(e)[:200]}")

# Enhanced API Routes with better error handling
@api_router.get("/")
async def root():
    return {"message": "GST Reconciliation API v1.0", "status": "operational"}

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        await db.command("ping")
        return {"status": "healthy", "database": "connected", "timestamp": datetime.now(timezone.utc)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

@api_router.post("/upload/{record_type}")
async def upload_gst_data(record_type: str, file: UploadFile = File(...)):
    """Upload GST data (2B or BOOKS) via Excel/CSV file with enhanced error handling"""
    
    # Validate record type
    if record_type not in ["2B", "BOOKS"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid record type. Must be '2B' or 'BOOKS'"
        )
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")
    
    if not validate_file_type(file.filename):
        raise HTTPException(
            status_code=400, 
            detail={
                "error": "Invalid file type",
                "message": f"File '{file.filename}' is not supported",
                "supported_formats": ["Excel (.xlsx, .xls)", "CSV (.csv)"],
                "uploaded_file": file.filename
            }
        )
    
    # Check file size (limit to 10MB)
    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(
            status_code=413, 
            detail="File too large. Maximum size is 10MB"
        )
    
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    
    try:
        # Process file data
        records_data = process_excel_data(file_content, record_type)
        
        if not records_data:
            raise HTTPException(
                status_code=400, 
                detail="No valid records found in file. Please check the file format and data."
            )
        
        # Clear existing records of this type
        try:
            delete_result = await db.gst_records.delete_many({"record_type": record_type})
            logging.info(f"Deleted {delete_result.deleted_count} existing {record_type} records")
        except Exception as e:
            logging.warning(f"Error clearing existing records: {str(e)}")
        
        # Validate and create GST records
        valid_records = []
        validation_errors = []
        
        for i, record_data in enumerate(records_data):
            try:
                gst_record = GSTRecord(**record_data)
                valid_records.append(gst_record)
            except Exception as e:
                validation_errors.append(f"Record {i+1}: {str(e)}")
        
        if not valid_records:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No valid records after validation",
                    "validation_errors": validation_errors[:10]
                }
            )
        
        # Save to database
        try:
            record_dicts = [prepare_for_mongo(record.dict()) for record in valid_records]
            result = await db.gst_records.insert_many(record_dicts)
            
            response = {
                "message": f"Successfully uploaded {len(result.inserted_ids)} {record_type} records",
                "uploaded_count": len(result.inserted_ids),
                "filename": file.filename,
                "record_type": record_type
            }
            
            if validation_errors:
                response["warnings"] = {
                    "failed_validations": len(validation_errors),
                    "errors": validation_errors[:5]
                }
            
            return response
            
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"Error saving records to database: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error in upload_gst_data: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Unexpected error processing upload: {str(e)[:200]}"
        )

@api_router.post("/records/{record_type}", response_model=GSTRecord)
async def create_gst_record(record_type: str, record: GSTRecordCreate):
    """Create a single GST record manually with enhanced validation"""
    if record_type not in ["2B", "BOOKS"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid record type. Must be '2B' or 'BOOKS'"
        )
    
    try:
        # Calculate total tax
        total_tax = record.cgst + record.sgst + record.igst
        
        # Create record dict and update with additional fields
        record_data = record.dict()
        record_data['total_tax'] = total_tax
        record_data['record_type'] = record_type  # Use the path parameter
        
        # Validate the complete record
        gst_record = GSTRecord(**record_data)
        
        # Save to database
        record_dict = prepare_for_mongo(gst_record.dict())
        await db.gst_records.insert_one(record_dict)
        
        return gst_record
        
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logging.error(f"Error creating GST record: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error creating record: {str(e)}"
        )

@api_router.get("/records/{record_type}", response_model=List[GSTRecord])
async def get_gst_records(record_type: str):
    """Get all GST records of a specific type with error handling"""
    if record_type not in ["2B", "BOOKS", "ALL"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid record type. Must be '2B', 'BOOKS', or 'ALL'"
        )
    
    try:
        if record_type == "ALL":
            records = await db.gst_records.find().to_list(length=None)
        else:
            records = await db.gst_records.find({"record_type": record_type}).to_list(length=None)
        
        return [GSTRecord(**parse_from_mongo(record)) for record in records]
        
    except Exception as e:
        logging.error(f"Error retrieving GST records: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error retrieving records: {str(e)}"
        )

@api_router.post("/reconcile")
async def reconcile_data():
    """Perform reconciliation between 2B and Books data"""
    try:
        matches_count = await perform_reconciliation()
        return {
            "message": "Reconciliation completed successfully",
            "matches_processed": matches_count,
            "timestamp": datetime.now(timezone.utc)
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in reconcile_data: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Reconciliation failed: {str(e)}"
        )

@api_router.get("/reconciliation/summary", response_model=ReconciliationSummary)
async def get_reconciliation_summary():
    """Get reconciliation summary statistics with error handling"""
    try:
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
            total_amount_difference=round(total_amount_diff, 2),
            total_tax_difference=round(total_tax_diff, 2)
        )
        
    except Exception as e:
        logging.error(f"Error getting reconciliation summary: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error retrieving reconciliation summary: {str(e)}"
        )

@api_router.get("/reconciliation/matches", response_model=List[ReconciliationMatch])
async def get_reconciliation_matches(status: Optional[str] = None):
    """Get reconciliation matches with optional status filter"""
    try:
        if status and status not in ["MATCHED", "UNMATCHED_2B", "UNMATCHED_BOOKS", "AMOUNT_MISMATCH", "TAX_MISMATCH"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid status filter. Must be one of: MATCHED, UNMATCHED_2B, UNMATCHED_BOOKS, AMOUNT_MISMATCH, TAX_MISMATCH"
            )
        
        if status:
            matches = await db.reconciliation_matches.find({"match_status": status}).to_list(length=None)
        else:
            matches = await db.reconciliation_matches.find().to_list(length=None)
        
        return [ReconciliationMatch(**parse_from_mongo(match)) for match in matches]
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting reconciliation matches: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error retrieving reconciliation matches: {str(e)}"
        )

@api_router.get("/reconciliation/export")
async def export_reconciliation_results():
    """Export reconciliation results to Excel with enhanced error handling"""
    try:
        # Get all matches with detailed data
        matches = await db.reconciliation_matches.find().to_list(length=None)
        
        if not matches:
            raise HTTPException(
                status_code=404, 
                detail="No reconciliation results found. Please perform reconciliation first."
            )
        
        # Prepare data for export
        export_data = []
        for match in matches:
            books_record = None
            twob_record = None
            
            try:
                if match.get('books_record_id'):
                    books_record = await db.gst_records.find_one({"id": match['books_record_id']})
                if match.get('twob_record_id'):
                    twob_record = await db.gst_records.find_one({"id": match['twob_record_id']})
            except Exception as e:
                logging.warning(f"Error fetching related records for match {match.get('id')}: {str(e)}")
            
            row = {
                'GSTIN': match['gstin'],
                'Invoice Number': match['invoice_number'],
                'Match Status': match['match_status'],
                'Books Amount': books_record.get('invoice_amount', 0) if books_record else 0,
                '2B Amount': twob_record.get('invoice_amount', 0) if twob_record else 0,
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
                'Total Tax Difference': match.get('total_tax_diff', 0),
                'Books Vendor': books_record.get('vendor_name', '') if books_record else '',
                'Books Date': books_record.get('invoice_date', '') if books_record else '',
                '2B Date': twob_record.get('invoice_date', '') if twob_record else ''
            }
            export_data.append(row)
        
        # Create Excel file
        df = pd.DataFrame(export_data)
        
        # Create temporary file with better naming
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx', prefix=f'gst_reconciliation_{timestamp}_') as tmp_file:
            df.to_excel(tmp_file.name, index=False, sheet_name='GST Reconciliation')
            tmp_file_path = tmp_file.name
        
        return FileResponse(
            tmp_file_path,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename=f'gst_reconciliation_report_{timestamp}.xlsx',
            headers={"Content-Disposition": f"attachment; filename=gst_reconciliation_report_{timestamp}.xlsx"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error exporting reconciliation data: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error exporting data: {str(e)[:200]}"
        )

@api_router.delete("/records/{record_type}")
async def clear_records(record_type: str):
    """Clear all records of a specific type with enhanced feedback"""
    if record_type not in ["2B", "BOOKS", "ALL"]:
        raise HTTPException(
            status_code=400, 
            detail="Invalid record type. Must be '2B', 'BOOKS', or 'ALL'"
        )
    
    try:
        if record_type == "ALL":
            books_result = await db.gst_records.delete_many({"record_type": "BOOKS"})
            twob_result = await db.gst_records.delete_many({"record_type": "2B"})
            matches_result = await db.reconciliation_matches.delete_many({})
            
            return {
                "message": "All data cleared successfully",
                "deleted_books_records": books_result.deleted_count,
                "deleted_2b_records": twob_result.deleted_count,
                "deleted_reconciliation_matches": matches_result.deleted_count,
                "total_deleted": books_result.deleted_count + twob_result.deleted_count + matches_result.deleted_count
            }
        else:
            result = await db.gst_records.delete_many({"record_type": record_type})
            # Also clear reconciliation matches if we're clearing data
            if result.deleted_count > 0:
                await db.reconciliation_matches.delete_many({})
            
            return {
                "message": f"{record_type} data cleared successfully",
                "deleted_records": result.deleted_count,
                "record_type": record_type
            }
            
    except Exception as e:
        logging.error(f"Error clearing records: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error clearing records: {str(e)}"
        )

# Include the router in the main app
app.include_router(api_router)

# Enhanced CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced error handling
@app.exception_handler(422)
async def validation_exception_handler(request, exc):
    return {"error": "Validation Error", "details": exc.detail}

@app.exception_handler(500)
async def internal_server_error_handler(request, exc):
    return {"error": "Internal Server Error", "message": "An unexpected error occurred"}

# Configure enhanced logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/gst_reconciliation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    logger.info("GST Reconciliation API starting up...")
    try:
        await db.command("ping")
        logger.info("Database connection established successfully")
    except Exception as e:
        logger.error(f"Database connection failed: {str(e)}")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Application shutdown event"""
    logger.info("GST Reconciliation API shutting down...")
    client.close()
    logger.info("Database connection closed")