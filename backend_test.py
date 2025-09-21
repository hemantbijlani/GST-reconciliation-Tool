import requests
import sys
import json
import tempfile
import pandas as pd
from datetime import datetime
import os

class GSTReconciliationTester:
    def __init__(self, base_url="https://recongst.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, response.content
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.json()}")
                except:
                    print(f"Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def create_sample_excel_file(self, record_type):
        """Create sample Excel file for testing"""
        if record_type == "BOOKS":
            data = [
                {
                    'GSTIN': '27AABCU9603R1ZX',
                    'Invoice Number': 'INV001',
                    'Invoice Date': '2024-01-15',
                    'Invoice Amount': 10000.00,
                    'CGST': 900.00,
                    'SGST': 900.00,
                    'IGST': 0.00,
                    'Vendor Name': 'ABC Suppliers'
                },
                {
                    'GSTIN': '29AABCU9603R1ZY',
                    'Invoice Number': 'INV002',
                    'Invoice Date': '2024-01-16',
                    'Invoice Amount': 15000.00,
                    'CGST': 1350.00,
                    'SGST': 1350.00,
                    'IGST': 0.00,
                    'Vendor Name': 'XYZ Corp'
                },
                {
                    'GSTIN': '27AABCU9603R1ZZ',
                    'Invoice Number': 'INV003',
                    'Invoice Date': '2024-01-17',
                    'Invoice Amount': 8000.00,
                    'CGST': 720.00,
                    'SGST': 720.00,
                    'IGST': 0.00,
                    'Vendor Name': 'PQR Ltd'
                }
            ]
        else:  # 2B data
            data = [
                {
                    'GSTIN': '27AABCU9603R1ZX',
                    'Invoice Number': 'INV001',
                    'Invoice Date': '2024-01-15',
                    'Invoice Amount': 10000.00,  # Perfect match
                    'CGST': 900.00,
                    'SGST': 900.00,
                    'IGST': 0.00
                },
                {
                    'GSTIN': '29AABCU9603R1ZY',
                    'Invoice Number': 'INV002',
                    'Invoice Date': '2024-01-16',
                    'Invoice Amount': 14500.00,  # Amount mismatch
                    'CGST': 1350.00,
                    'SGST': 1350.00,
                    'IGST': 0.00
                },
                {
                    'GSTIN': '27AABCU9603R1ZA',
                    'Invoice Number': 'INV004',
                    'Invoice Date': '2024-01-18',
                    'Invoice Amount': 12000.00,  # Unmatched 2B record
                    'CGST': 1080.00,
                    'SGST': 1080.00,
                    'IGST': 0.00
                }
            ]

        # Create temporary Excel file
        df = pd.DataFrame(data)
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        df.to_excel(temp_file.name, index=False)
        return temp_file.name

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root Endpoint", "GET", "", 200)

    def test_file_upload(self, record_type):
        """Test file upload functionality"""
        file_path = self.create_sample_excel_file(record_type)
        
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (f'{record_type.lower()}_data.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
                success, response = self.run_test(
                    f"Upload {record_type} File",
                    "POST",
                    f"upload/{record_type}",
                    200,
                    files=files
                )
            return success, response
        finally:
            # Clean up temp file
            try:
                os.unlink(file_path)
            except:
                pass

    def test_manual_record_creation(self, record_type):
        """Test manual record creation"""
        if record_type == "BOOKS":
            data = {
                "gstin": "27MANUAL0001ZX5",
                "invoice_number": "MAN001",
                "invoice_date": "2024-01-20",
                "invoice_amount": 5000.00,
                "cgst": 450.00,
                "sgst": 450.00,
                "igst": 0.00,
                "vendor_name": "Manual Entry Vendor",
                "record_type": record_type
            }
        else:
            data = {
                "gstin": "27MANUAL0001ZX5",
                "invoice_number": "MAN001",
                "invoice_date": "2024-01-20",
                "invoice_amount": 5200.00,  # Slight amount difference for testing
                "cgst": 468.00,
                "sgst": 468.00,
                "igst": 0.00,
                "record_type": record_type
            }

        return self.run_test(
            f"Create Manual {record_type} Record",
            "POST",
            f"records/{record_type}",
            200,
            data=data
        )

    def test_get_records(self, record_type):
        """Test getting records"""
        return self.run_test(
            f"Get {record_type} Records",
            "GET",
            f"records/{record_type}",
            200
        )

    def test_reconciliation(self):
        """Test reconciliation process"""
        return self.run_test(
            "Perform Reconciliation",
            "POST",
            "reconcile",
            200
        )

    def test_reconciliation_summary(self):
        """Test reconciliation summary"""
        return self.run_test(
            "Get Reconciliation Summary",
            "GET",
            "reconciliation/summary",
            200
        )

    def test_reconciliation_matches(self):
        """Test getting reconciliation matches"""
        return self.run_test(
            "Get Reconciliation Matches",
            "GET",
            "reconciliation/matches",
            200
        )

    def test_export_results(self):
        """Test export functionality"""
        return self.run_test(
            "Export Reconciliation Results",
            "GET",
            "reconciliation/export",
            200
        )

    def test_clear_data(self, record_type):
        """Test clearing data"""
        return self.run_test(
            f"Clear {record_type} Data",
            "DELETE",
            f"records/{record_type}",
            200
        )

def main():
    print("🚀 Starting GST Reconciliation API Tests")
    print("=" * 50)
    
    tester = GSTReconciliationTester()
    
    # Test 1: Root endpoint
    tester.test_root_endpoint()
    
    # Test 2: Clear any existing data
    tester.test_clear_data("ALL")
    
    # Test 3: File uploads
    print("\n📁 Testing File Upload Functionality")
    tester.test_file_upload("BOOKS")
    tester.test_file_upload("2B")
    
    # Test 4: Manual record creation
    print("\n✏️ Testing Manual Record Creation")
    tester.test_manual_record_creation("BOOKS")
    tester.test_manual_record_creation("2B")
    
    # Test 5: Get records
    print("\n📊 Testing Data Retrieval")
    success, books_data = tester.test_get_records("BOOKS")
    if success:
        print(f"   Books records count: {len(books_data)}")
    
    success, twob_data = tester.test_get_records("2B")
    if success:
        print(f"   2B records count: {len(twob_data)}")
    
    tester.test_get_records("ALL")
    
    # Test 6: Reconciliation
    print("\n🔄 Testing Reconciliation Process")
    success, recon_result = tester.test_reconciliation()
    if success:
        print(f"   Matches processed: {recon_result.get('matches_processed', 'N/A')}")
    
    # Test 7: Reconciliation results
    print("\n📈 Testing Reconciliation Results")
    success, summary = tester.test_reconciliation_summary()
    if success:
        print(f"   Total Books: {summary.get('total_books_records', 0)}")
        print(f"   Total 2B: {summary.get('total_2b_records', 0)}")
        print(f"   Matched: {summary.get('matched_records', 0)}")
        print(f"   Amount Mismatches: {summary.get('amount_mismatches', 0)}")
        print(f"   Tax Mismatches: {summary.get('tax_mismatches', 0)}")
        print(f"   Unmatched Books: {summary.get('unmatched_books_records', 0)}")
        print(f"   Unmatched 2B: {summary.get('unmatched_2b_records', 0)}")
    
    success, matches = tester.test_reconciliation_matches()
    if success:
        print(f"   Total matches returned: {len(matches)}")
        # Show sample match statuses
        statuses = {}
        for match in matches:
            status = match.get('match_status', 'UNKNOWN')
            statuses[status] = statuses.get(status, 0) + 1
        print(f"   Match status breakdown: {statuses}")
    
    # Test 8: Export functionality
    print("\n💾 Testing Export Functionality")
    tester.test_export_results()
    
    # Test 9: Data clearing
    print("\n🗑️ Testing Data Clearing")
    tester.test_clear_data("BOOKS")
    tester.test_clear_data("2B")
    
    # Final results
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend tests passed!")
        return 0
    else:
        print(f"❌ {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())